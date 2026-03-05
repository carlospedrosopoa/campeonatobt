import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const grupos = await classificacaoCategoriaService.obterClassificacao(categoriaId);
    return NextResponse.json(grupos, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao obter classificação pública:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
