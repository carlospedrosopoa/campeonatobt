import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { getSession } from "@/lib/auth";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);

    if (!torneio) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    return NextResponse.json(torneio);
  } catch (error) {
    console.error("Erro ao buscar torneio:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const body = await request.json();

    const atualizado = await torneiosService.atualizarPorSlug(slug, body);
    if (!atualizado) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    return NextResponse.json(atualizado);
  } catch (error) {
    console.error("Erro ao atualizar torneio:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const excluido = await torneiosService.excluirPorSlug(slug);
    if (!excluido) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    console.error("Erro ao excluir torneio:", error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
