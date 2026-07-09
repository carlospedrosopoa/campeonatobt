﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { categoriasService } from "@/services/categorias.service";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { MataMataService } from "@/services/mata-mata.service";
import { db } from "@/db";
import { partidas } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { calcularResultadoPartida, obterRegrasPartidaEfetivas } from "@/lib/regras-partida";

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

    const partidaRows = await db
      .select({
        id: partidas.id,
        torneioId: partidas.torneioId,
        categoriaId: partidas.categoriaId,
        fase: partidas.fase,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);

    const partida = partidaRows[0];
    if (!partida) return NextResponse.json({ error: "Partida nÃ£o encontrada" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const detalhesPlacar = Array.isArray(body?.detalhesPlacar) ? body.detalhesPlacar : [];

    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    const regras = obterRegrasPartidaEfetivas({
      regrasBase: config.regrasPartida,
      superCampeonato: torneio.superCampeonato,
      superCampeonatoFormato: torneio.superCampeonatoFormato,
    });

    const resultado = calcularResultadoPartida({
      regras,
      equipeAId: partida.equipeAId,
      equipeBId: partida.equipeBId,
      detalhesPlacar,
    });

    const [updated] = await db
      .update(partidas)
      .set({
        detalhesPlacar: resultado.detalhesPlacar as any,
        placarA: resultado.placarA,
        placarB: resultado.placarB,
        vencedorId: resultado.vencedorId,
        status: "FINALIZADA",
        finalizadoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, partidaId))
      .returning();

    let proximaFaseCriada: string | null = null;
    let partidasCriadas = 0;
    let proximaFaseAtualizada: string | null = null;
    let partidasAtualizadas = 0;
    if (partida.fase !== "GRUPOS") {
      const mataMataService = new MataMataService();
      const r = await mataMataService.sincronizarChaveAposAtualizacaoResultado({
        torneioId: torneio.id,
        categoriaId,
        faseAtual: partida.fase as any,
      });
      proximaFaseCriada = r.faseCriada ?? null;
      partidasCriadas = r.partidasCriadas ?? 0;
      proximaFaseAtualizada = r.faseAtualizada ?? null;
      partidasAtualizadas = r.partidasAtualizadas ?? 0;
    }

    return NextResponse.json({ partida: updated, proximaFaseCriada, partidasCriadas, proximaFaseAtualizada, partidasAtualizadas });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const { slug, partidaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = await request.json();
    const { fotoUrl, transmissaoUrl } = body;

    const [updated] = await db
      .update(partidas)
      .set({
        fotoUrl,
        transmissaoUrl,
        atualizadoEm: new Date(),
      })
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Partida nÃ£o encontrada" }, { status: 404 });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao atualizar partida" }, { status: 500 });
  }
}
