import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriaEmAndamento, operacaoService } from "@/services/operacao.service";
import { validarCodigoTelao } from "@/lib/telao-codigo";

/** Estado da operacao para o telao aberto por link com codigo (sem login). Query: ?c=CODIGO */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio || !torneio.operacaoAoVivo || !validarCodigoTelao(torneio.id, request.nextUrl.searchParams.get("c"))) {
      return NextResponse.json({ error: "Link do telão inválido" }, { status: 404 });
    }
    const categoriaId = request.nextUrl.searchParams.get("categoriaId") || (await categoriaEmAndamento(torneio.id));
    const estado = await operacaoService.estado({ torneioId: torneio.id, categoriaId });
    return NextResponse.json(estado, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
