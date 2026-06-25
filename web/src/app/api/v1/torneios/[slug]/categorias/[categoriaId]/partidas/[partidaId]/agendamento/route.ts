import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { db } from "@/db";
import { arenas, partidas } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const { slug, categoriaId, partidaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    const partidaRow = await db
      .select({ id: partidas.id, torneioId: partidas.torneioId, categoriaId: partidas.categoriaId })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);
    if (!partidaRow[0]) return NextResponse.json({ error: "Partida nÃ£o encontrada" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const arenaId = (body?.arenaId as string | null | undefined) ?? null;
    const quadra = (body?.quadra as string | null | undefined) ?? null;
    const dataHorarioRaw = (body?.dataHorario as string | null | undefined) ?? null;
    const dataLimiteRaw = (body?.dataLimite as string | null | undefined) ?? null;

    if (arenaId) {
      const a = await db
        .select({ id: arenas.id })
        .from(arenas)
        .where(and(eq(arenas.id, arenaId), eq(arenas.torneioId, torneio.id)))
        .limit(1);
      if (!a[0]) return NextResponse.json({ error: "Arena invÃ¡lida para o torneio" }, { status: 400 });
    }

    const dataHorario = dataHorarioRaw ? new Date(dataHorarioRaw) : null;
    const dataLimite = dataLimiteRaw ? new Date(dataLimiteRaw) : null;
    if (dataHorario && Number.isNaN(dataHorario.getTime())) return NextResponse.json({ error: "Data/hora invÃ¡lida" }, { status: 400 });
    if (dataLimite && Number.isNaN(dataLimite.getTime())) return NextResponse.json({ error: "Data limite invÃ¡lida" }, { status: 400 });
    if (dataHorario && !arenaId) return NextResponse.json({ error: "Arena Ã© obrigatÃ³ria para agendar a partida" }, { status: 400 });

    const [updated] = await db
      .update(partidas)
      .set({
        arenaId,
        quadra: quadra ? quadra.trim() : null,
        dataHorario,
        dataLimite,
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, partidaId))
      .returning();

    return NextResponse.json({ partida: updated });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

