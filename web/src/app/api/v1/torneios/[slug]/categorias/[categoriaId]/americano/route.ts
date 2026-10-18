import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { americanoService, ErroAmericano } from "@/services/americano.service";

type Params = { params: Promise<{ slug: string; categoriaId: string }> };

/** Ranking individual do Americano. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    return NextResponse.json(await americanoService.ranking(categoriaId));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 500 });
  }
}

/**
 * { acao: "gerar", quadras, jogosPorAtleta? } gera (ou refaz) as rodadas com parceiro rotativo.
 * { acao: "final" } gera a final balanceada (1º+4º x 2º+3º).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = (await request.json().catch(() => null)) as any;
    if (body?.acao === "final") {
      return NextResponse.json(await americanoService.gerarFinal({ torneioId: torneio.id, categoriaId }));
    }
    if (body?.acao === "gerar") {
      const quadras = Math.trunc(Number(body?.quadras)) || torneio.quadrasAtivas || 1;
      const jogosPorAtleta = Number(body?.jogosPorAtleta) > 0 ? Math.min(30, Math.trunc(Number(body.jogosPorAtleta))) : undefined;
      return NextResponse.json(await americanoService.gerarRodadas({ torneioId: torneio.id, categoriaId, quadras, jogosPorAtleta }));
    }
    return NextResponse.json({ error: "Ação inválida (use gerar ou final)" }, { status: 400 });
  } catch (error: any) {
    const status = error instanceof ErroAmericano ? error.status : 500;
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status });
  }
}
