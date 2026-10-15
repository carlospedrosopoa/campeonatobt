import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { partidas } from "@/db/schema";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { ErroPlacar, placarSubmissoesService } from "@/services/placar-submissoes.service";

/** Admin do torneio confirma ou recusa o placar informado por atleta. Body: { acao: "confirmar" | "recusar" } */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  const { slug, categoriaId, partidaId } = await params;
  const acesso = await requireTournamentAdminBySlug(slug);
  if ("response" in acesso) return acesso.response;

  const [partida] = await db
    .select({ id: partidas.id })
    .from(partidas)
    .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, acesso.torneio.id), eq(partidas.categoriaId, categoriaId)))
    .limit(1);
  if (!partida) return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const acao = body?.acao;
  try {
    if (acao === "confirmar") {
      const updated = await placarSubmissoesService.confirmarPendente({ partidaId, confirmadoPorUsuarioId: String(acesso.user.id) });
      return NextResponse.json({ ok: true, partida: updated }, { headers: { "Cache-Control": "no-store" } });
    }
    if (acao === "recusar") {
      await placarSubmissoesService.recusarPendente({ partidaId, motivo: "Recusado pela organização" });
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    if (e instanceof ErroPlacar) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Erro ao decidir placar pendente:", e);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
