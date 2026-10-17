import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { operacaoDesabilitada } from "@/lib/operacao-texto";
import { operacaoService } from "@/services/operacao.service";

/** Estado da operacao do dia: quadras, sugestoes de chamada e fila da categoria em andamento. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    if (!acesso.torneio.operacaoAoVivo) return operacaoDesabilitada();
    const categoriaId = request.nextUrl.searchParams.get("categoriaId");
    const estado = await operacaoService.estado({ torneioId: acesso.torneio.id, categoriaId });
    return NextResponse.json(estado, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
