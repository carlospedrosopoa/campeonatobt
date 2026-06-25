import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { arenasService } from "@/services/arenas.service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string; arenaId: string }> }) {
  try {
    const { slug, arenaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = await request.json().catch(() => null);
    const nome = (body?.nome as string | undefined)?.trim();
    if (!nome) return NextResponse.json({ error: "Nome Ã© obrigatÃ³rio" }, { status: 400 });

    const updated = await arenasService.atualizar({ id: arenaId, torneioId: torneio.id, nome });
    if (!updated) return NextResponse.json({ error: "Arena nÃ£o encontrada" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string; arenaId: string }> }) {
  try {
    const { slug, arenaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const deleted = await arenasService.excluir({ id: arenaId, torneioId: torneio.id });
    if (!deleted) return NextResponse.json({ error: "Arena nÃ£o encontrada" }, { status: 404 });
    return NextResponse.json(deleted);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}


