﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { MataMataService } from "@/services/mata-mata.service";
import { db } from "@/db";
import { partidas } from "@/db/schema";
import { and, eq, not } from "drizzle-orm";

export async function POST(
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

    const partidaRows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
      })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);
    const partida = partidaRows[0];
    if (!partida) {
      return NextResponse.json({ error: "Partida nÃ£o encontrada" }, { status: 404 });
    }

    if (partida.fase === "GRUPOS") {
      const partidasPosteriores = await db
        .select({ id: partidas.id })
        .from(partidas)
        .where(and(eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId), not(eq(partidas.fase, "GRUPOS"))))
        .limit(1);

      if (partidasPosteriores.length > 0) {
        return NextResponse.json(
          { error: "NÃ£o Ã© possÃ­vel cancelar placar dos grupos depois que o mata-mata foi gerado" },
          { status: 400 }
        );
      }

      const [updated] = await db
        .update(partidas)
        .set({
          vencedorId: null,
          placarA: 0,
          placarB: 0,
          detalhesPlacar: null as any,
          status: "AGENDADA",
          finalizadoEm: null,
          atualizadoEm: new Date(),
        })
        .where(eq(partidas.id, partidaId))
        .returning();

      return NextResponse.json({ partida: updated });
    }

    const mataMataService = new MataMataService();
    const updated = await mataMataService.cancelarPlacarSePossivel({
      torneioId: torneio.id,
      categoriaId,
      partidaId,
    });

    return NextResponse.json({ partida: updated });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

