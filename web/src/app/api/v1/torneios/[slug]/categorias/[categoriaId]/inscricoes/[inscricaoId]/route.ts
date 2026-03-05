import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { inscricoesService } from "@/services/inscricoes.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; inscricaoId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId, inscricaoId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const del = await inscricoesService.excluir(inscricaoId);
    if (!del) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir inscrição:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

