import { NextRequest, NextResponse } from "next/server";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { torneioAtletaPrefs, torneios, usuarios } from "@/db/schema";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playGetAtletaById } from "@/services/playnaquadra-client";
import { extractCamisetaFromPlay } from "@/services/playnaquadra-camiseta";

function normalizeOption(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function findMatch(opcoes: string[], value?: string | null) {
  const normalized = normalizeOption(value);
  if (!normalized) return null;
  const byLower = new Map(opcoes.map((item) => [normalizeOption(item).toLowerCase(), item]));
  return byLower.get(normalized.toLowerCase()) ?? null;
}

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; atletaId: string }> }
) {
  try {
    const { slug, atletaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const atletaParamId = String(atletaId || "").trim();
    const email = normalizeEmail(request.nextUrl.searchParams.get("email"));

    const torneioRows = await db
      .select({ camisetaOpcoes: torneios.camisetaOpcoes })
      .from(torneios)
      .where(eq(torneios.id, torneio.id))
      .limit(1);

    const opcoes = Array.isArray(torneioRows[0]?.camisetaOpcoes)
      ? torneioRows[0]!.camisetaOpcoes.map((item) => String(item))
      : [];

    let usuarioId = "";
    let playAtletaId = atletaParamId;

    if (atletaParamId || email) {
      const usuarioRows = await db
        .select({
          id: usuarios.id,
          playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
        })
        .from(usuarios)
        .where(
          or(
            atletaParamId ? eq(usuarios.id, atletaParamId) : sql`false`,
            atletaParamId ? eq(usuarios.playnaquadraAtletaId, atletaParamId) : sql`false`,
            email ? eq(usuarios.email, email) : sql`false`
          )
        )
        .limit(1);

      usuarioId = usuarioRows[0]?.id ?? "";
      playAtletaId = usuarioRows[0]?.playnaquadraAtletaId ?? atletaParamId;
    }

    const prefRows = usuarioId
      ? await db
          .select({ camisetaOpcao: torneioAtletaPrefs.camisetaOpcao })
          .from(torneioAtletaPrefs)
          .where(and(eq(torneioAtletaPrefs.torneioId, torneio.id), eq(torneioAtletaPrefs.usuarioId, usuarioId)))
          .limit(1)
      : [];

    const selecionada =
      opcoes.length > 0
        ? findMatch(opcoes, prefRows[0]?.camisetaOpcao)
        : normalizeOption(prefRows[0]?.camisetaOpcao);

    let playDefault: string | null = null;
    if (playAtletaId) {
      try {
        const token = await getPlayAdminToken();
        const result = await playGetAtletaById({ token, atletaId: playAtletaId });
        if (result.res.ok) {
          const camiseta = extractCamisetaFromPlay(result.data);
          playDefault = opcoes.length > 0 ? findMatch(opcoes, camiseta) : normalizeOption(camiseta);
        }
      } catch {
        playDefault = null;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        opcoes,
        selecionada: selecionada || null,
        playDefault: playDefault || null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    console.error("Erro ao consultar camiseta do atleta:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; atletaId: string }> }
) {
  try {
    const { slug, atletaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = (await request.json().catch(() => null)) as any;
    const rawOpcao = typeof body?.camisetaOpcao === "string" ? body.camisetaOpcao : "";
    const opcao = normalizeOption(rawOpcao);

    const torneioRows = await db
      .select({ camisetaOpcoes: torneios.camisetaOpcoes })
      .from(torneios)
      .where(eq(torneios.id, torneio.id))
      .limit(1);

    const opcoes = Array.isArray(torneioRows[0]?.camisetaOpcoes)
      ? torneioRows[0]!.camisetaOpcoes.map((item) => String(item))
      : [];

    if (!opcao) {
      await db
        .delete(torneioAtletaPrefs)
        .where(and(eq(torneioAtletaPrefs.torneioId, torneio.id), eq(torneioAtletaPrefs.usuarioId, atletaId)));

      return NextResponse.json({ ok: true, camisetaOpcao: null });
    }

    const match = opcoes.length > 0 ? findMatch(opcoes, opcao) : opcao;
    if (!match) {
      return NextResponse.json({ error: "Opção de camiseta inválida para este torneio" }, { status: 400 });
    }

    const [saved] = await db
      .insert(torneioAtletaPrefs)
      .values({
        torneioId: torneio.id,
        usuarioId: atletaId,
        camisetaOpcao: match,
        atualizadoEm: new Date(),
      })
      .onConflictDoUpdate({
        target: [torneioAtletaPrefs.torneioId, torneioAtletaPrefs.usuarioId],
        set: { camisetaOpcao: match, atualizadoEm: new Date() },
      })
      .returning({ camisetaOpcao: torneioAtletaPrefs.camisetaOpcao });

    return NextResponse.json({ ok: true, camisetaOpcao: saved?.camisetaOpcao ?? match });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    console.error("Erro ao atualizar camiseta do atleta:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
