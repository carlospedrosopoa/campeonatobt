import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { torneioAtletaPrefs, torneios, usuarios } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { playGetAtletaById, playGetAtletaMe } from "@/services/playnaquadra-client";
import { extractCamisetaFromPlay } from "@/services/playnaquadra-camiseta";

function normalizeOption(value: string) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function findMatch(opcoes: string[], value: string | null) {
  const v = normalizeOption(value || "");
  if (!v) return null;
  const byLower = new Map(opcoes.map((o) => [normalizeOption(o).toLowerCase(), o]));
  return byLower.get(v.toLowerCase()) ?? null;
}

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizeGeneroAtleta(value: unknown) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (!normalized) return null;
  if (["m", "masculino", "male", "homem"].includes(normalized)) return "MASCULINO" as const;
  if (["f", "feminino", "female", "mulher"].includes(normalized)) return "FEMININO" as const;
  return null;
}

function extractPlayGenero(payload: any) {
  return normalizeGeneroAtleta(
    payload?.genero ||
      payload?.sexo ||
      payload?.gender ||
      payload?.atleta?.genero ||
      payload?.atleta?.sexo ||
      payload?.usuario?.genero ||
      payload?.usuario?.sexo ||
      payload?.user?.genero ||
      payload?.user?.sexo
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ torneioId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { torneioId } = await params;
  const tId = (torneioId || "").trim();
  if (!tId) return NextResponse.json({ error: "torneioId inválido" }, { status: 400 });
  const parceiroAtletaId = String(request.nextUrl.searchParams.get("atletaId") || "").trim();
  const parceiroEmail = normalizeEmail(request.nextUrl.searchParams.get("email"));

  const tRows = await db
    .select({ id: torneios.id, nome: torneios.nome, camisetaOpcoes: torneios.camisetaOpcoes })
    .from(torneios)
    .where(eq(torneios.id, tId))
    .limit(1);
  const torneio = tRows[0];
  if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  const opcoes = Array.isArray(torneio.camisetaOpcoes) ? (torneio.camisetaOpcoes as any[]).map((s) => String(s)) : [];

  let targetUsuarioId = auth.user.id;
  let targetPlayAtletaId = "";
  let generoPerfil: "MASCULINO" | "FEMININO" | null = null;

  if (parceiroAtletaId || parceiroEmail) {
    const usuarioRows = await db
      .select({
        id: usuarios.id,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(usuarios)
      .where(
        or(
          parceiroAtletaId ? eq(usuarios.playnaquadraAtletaId, parceiroAtletaId) : sql`false`,
          parceiroEmail ? eq(usuarios.email, parceiroEmail) : sql`false`
        )
      )
      .limit(1);

    targetUsuarioId = usuarioRows[0]?.id ?? "";
    targetPlayAtletaId = usuarioRows[0]?.playnaquadraAtletaId ?? parceiroAtletaId;
  }

  const prefRows = targetUsuarioId
    ? await db
        .select({ camisetaOpcao: torneioAtletaPrefs.camisetaOpcao })
        .from(torneioAtletaPrefs)
        .where(and(eq(torneioAtletaPrefs.torneioId, tId), eq(torneioAtletaPrefs.usuarioId, targetUsuarioId)))
        .limit(1)
    : [];
  const selecionada = prefRows[0]?.camisetaOpcao ? findMatch(opcoes, prefRows[0].camisetaOpcao) : null;

  let playDefault: string | null = null;
  try {
    const tokenPlay = request.cookies.get("play_token")?.value || "";
    if (tokenPlay) {
      const res = parceiroAtletaId || targetPlayAtletaId
        ? await playGetAtletaById({ token: tokenPlay, atletaId: parceiroAtletaId || targetPlayAtletaId })
        : await playGetAtletaMe(tokenPlay);
      if (res.res.ok) {
        playDefault = extractCamisetaFromPlay(res.data);
        playDefault = findMatch(opcoes, playDefault);
        generoPerfil = extractPlayGenero(res.data);
      }
    }
  } catch {
    playDefault = null;
    generoPerfil = null;
  }

  return NextResponse.json(
    {
      torneio: { id: torneio.id, nome: torneio.nome },
      opcoes,
      selecionada,
      playDefault,
      genero: generoPerfil,
      generoPreenchido: Boolean(generoPerfil),
    },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ torneioId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { torneioId } = await params;
  const tId = (torneioId || "").trim();
  if (!tId) return NextResponse.json({ error: "torneioId inválido" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as any;
  const opcao = typeof body?.camisetaOpcao === "string" ? normalizeOption(body.camisetaOpcao) : "";
  if (!opcao) return NextResponse.json({ error: "camisetaOpcao é obrigatória" }, { status: 400 });

  const tRows = await db
    .select({ id: torneios.id, camisetaOpcoes: torneios.camisetaOpcoes })
    .from(torneios)
    .where(eq(torneios.id, tId))
    .limit(1);
  const torneio = tRows[0];
  if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  const opcoes = Array.isArray(torneio.camisetaOpcoes) ? (torneio.camisetaOpcoes as any[]).map((s) => String(s)) : [];
  const match = findMatch(opcoes, opcao);
  if (!match) return NextResponse.json({ error: "Opção de camiseta inválida para este torneio" }, { status: 400 });

  const [saved] = await db
    .insert(torneioAtletaPrefs)
    .values({
      torneioId: tId,
      usuarioId: auth.user.id,
      camisetaOpcao: match,
      atualizadoEm: new Date(),
    })
    .onConflictDoUpdate({
      target: [torneioAtletaPrefs.torneioId, torneioAtletaPrefs.usuarioId],
      set: { camisetaOpcao: match, atualizadoEm: new Date() },
    })
    .returning();

  return NextResponse.json(
    { ok: true, torneioId: tId, camisetaOpcao: saved?.camisetaOpcao ?? match },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
