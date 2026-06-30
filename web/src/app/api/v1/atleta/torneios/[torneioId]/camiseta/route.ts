import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { torneioAtletaPrefs, torneios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { playGetAtletaMe } from "@/services/playnaquadra-client";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ torneioId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { torneioId } = await params;
  const tId = (torneioId || "").trim();
  if (!tId) return NextResponse.json({ error: "torneioId inválido" }, { status: 400 });

  const tRows = await db
    .select({ id: torneios.id, nome: torneios.nome, camisetaOpcoes: torneios.camisetaOpcoes })
    .from(torneios)
    .where(eq(torneios.id, tId))
    .limit(1);
  const torneio = tRows[0];
  if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  const opcoes = Array.isArray(torneio.camisetaOpcoes) ? (torneio.camisetaOpcoes as any[]).map((s) => String(s)) : [];

  const prefRows = await db
    .select({ camisetaOpcao: torneioAtletaPrefs.camisetaOpcao })
    .from(torneioAtletaPrefs)
    .where(and(eq(torneioAtletaPrefs.torneioId, tId), eq(torneioAtletaPrefs.usuarioId, auth.user.id)))
    .limit(1);
  const selecionada = prefRows[0]?.camisetaOpcao ? findMatch(opcoes, prefRows[0].camisetaOpcao) : null;

  let playDefault: string | null = null;
  try {
    const tokenPlay = request.cookies.get("play_token")?.value || "";
    if (tokenPlay) {
      const res = await playGetAtletaMe(tokenPlay);
      if (res.res.ok) {
        playDefault = extractCamisetaFromPlay(res.data);
        playDefault = findMatch(opcoes, playDefault);
      }
    }
  } catch {
    playDefault = null;
  }

  return NextResponse.json(
    {
      torneio: { id: torneio.id, nome: torneio.nome },
      opcoes,
      selecionada,
      playDefault,
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
