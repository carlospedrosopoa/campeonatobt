﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { mataMataService } from "@/services/mata-mata.service";

type FaseMataMata = "OITAVAS" | "QUARTAS" | "SEMI";

function isFaseMataMata(value: unknown): value is FaseMataMata {
  return value === "OITAVAS" || value === "QUARTAS" || value === "SEMI";
}

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

    const body = await request.json().catch(() => null);
    const faseAtual = body?.faseAtual;
    if (!isFaseMataMata(faseAtual)) {
      return NextResponse.json({ error: "Fase atual invÃ¡lida" }, { status: 400 });
    }

    const resultado = await mataMataService.sincronizarChaveAposAtualizacaoResultado({
      torneioId: torneio.id,
      categoriaId,
      faseAtual,
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

