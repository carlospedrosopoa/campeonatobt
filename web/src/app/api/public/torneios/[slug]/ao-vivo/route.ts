import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriaEmAndamento, operacaoService, type JogoOperacao } from "@/services/operacao.service";
import { smartDoTorneio } from "@/services/smart-torneio.service";

/** Operacao ao vivo para o publico (pagina e app): mesmos dados do telao, sem nomes de quem falta. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    // Smart Torneio e torneio demo sao ocultos, mas quem tem o link acompanha ao vivo
    if (!torneio || !torneio.operacaoAoVivo || (torneio.oculto && !torneio.demo && !(await smartDoTorneio(torneio.id)))) {
      return NextResponse.json({ error: "Operação ao vivo indisponível" }, { status: 404 });
    }
    const categoriaId = request.nextUrl.searchParams.get("categoriaId") || (await categoriaEmAndamento(torneio.id));
    const estado = await operacaoService.estado({ torneioId: torneio.id, categoriaId });
    const limpar = (j: JogoOperacao): JogoOperacao => ({ ...j, faltando: [], ocupados: [] });
    return NextResponse.json(
      {
        ...estado,
        quadras: estado.quadras.map((q) => ({ ...q, jogo: q.jogo && limpar(q.jogo), sugestao: null, aguardando: null })),
        fila: estado.fila.map(limpar),
        chamadosSemQuadra: estado.chamadosSemQuadra.map(limpar),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
