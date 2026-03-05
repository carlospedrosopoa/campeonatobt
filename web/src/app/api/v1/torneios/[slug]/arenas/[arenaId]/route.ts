import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { arenasService } from "@/services/arenas.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string; arenaId: string }> }) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, arenaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const nome = (body?.nome as string | undefined)?.trim();
    if (!nome) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });

    const updated = await arenasService.atualizar({ id: arenaId, torneioId: torneio.id, nome });
    if (!updated) return NextResponse.json({ error: "Arena não encontrada" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string; arenaId: string }> }) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, arenaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const deleted = await arenasService.excluir({ id: arenaId, torneioId: torneio.id });
    if (!deleted) return NextResponse.json({ error: "Arena não encontrada" }, { status: 404 });
    return NextResponse.json(deleted);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

