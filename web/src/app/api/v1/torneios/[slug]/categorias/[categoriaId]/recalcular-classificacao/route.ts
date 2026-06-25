import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    const resultado = await classificacaoCategoriaService.recalcularPorCategoria(categoriaId);
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Erro ao recalcular classificaÃ§Ã£o:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}


