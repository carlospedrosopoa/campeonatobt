import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { torneioAtletaPrefs, torneios } from "@/db/schema";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";

function normalizeOption(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function findMatch(opcoes: string[], value?: string | null) {
  const normalized = normalizeOption(value);
  if (!normalized) return null;
  const byLower = new Map(opcoes.map((item) => [normalizeOption(item).toLowerCase(), item]));
  return byLower.get(normalized.toLowerCase()) ?? null;
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
