import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { dinamicaCategoriaService } from "@/services/dinamica-categoria.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const equipeOrigemId = (body?.equipeOrigemId as string | undefined)?.trim();
    const equipeDestinoId = (body?.equipeDestinoId as string | undefined)?.trim();
    if (!equipeOrigemId || !equipeDestinoId) {
      return NextResponse.json({ error: "Informe as duas duplas para trocar entre os grupos" }, { status: 400 });
    }

    const resultado = await dinamicaCategoriaService.trocarEquipesEntreGrupos({
      torneioId: torneio.id,
      categoriaId,
      equipeOrigemId,
      equipeDestinoId,
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
