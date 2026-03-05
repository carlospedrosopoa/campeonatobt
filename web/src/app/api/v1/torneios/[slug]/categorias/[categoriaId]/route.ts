import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { getSession } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    const permitido = perfil === "ADMIN" || perfil === "ORGANIZADOR";
    if (!permitido) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const existe = await categoriasService.buscarPorId(categoriaId);
    if (!existe || existe.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const nome = (body?.nome as string | undefined)?.trim();
    const genero = body?.genero as "MASCULINO" | "FEMININO" | "MISTO" | undefined;
    const valorInscricao = body?.valorInscricao as string | number | null | undefined;
    const vagasMaximas = body?.vagasMaximas as number | null | undefined;

    const atualizado = await categoriasService.atualizar(categoriaId, {
      nome,
      genero,
      valorInscricao,
      vagasMaximas,
    });

    return NextResponse.json(atualizado);
  } catch (error) {
    console.error("Erro ao atualizar categoria:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    const permitido = perfil === "ADMIN" || perfil === "ORGANIZADOR";
    if (!permitido) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const existe = await categoriasService.buscarPorId(categoriaId);
    if (!existe || existe.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    await categoriasService.excluir(categoriaId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

