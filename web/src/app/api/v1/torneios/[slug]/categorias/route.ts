﻿import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio nÃ£o encontrado" }, { status: 404 });

    const categorias = await categoriasService.listarPorTorneio(torneio.id);
    return NextResponse.json(categorias);
  } catch (error) {
    console.error("Erro ao listar categorias:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = await request.json().catch(() => null);
    const nome = (body?.nome as string | undefined)?.trim();
    const genero = body?.genero as "MASCULINO" | "FEMININO" | "MISTO" | undefined;
    const valorInscricao = body?.valorInscricao as string | number | undefined;
    const vagasMaximas = body?.vagasMaximas as number | null | undefined;
    const dataHorarioRaw = body?.dataHorario as string | null | undefined;
    const dataHorario = dataHorarioRaw ? new Date(dataHorarioRaw) : dataHorarioRaw === null ? null : undefined;
    if (dataHorario instanceof Date && Number.isNaN(dataHorario.getTime())) {
      return NextResponse.json({ error: "Data/hora invÃ¡lida" }, { status: 400 });
    }

    if (!nome || !genero) {
      return NextResponse.json({ error: "Campos obrigatÃ³rios faltando" }, { status: 400 });
    }

    const nova = await categoriasService.criar({
      torneioId: torneio.id,
      nome,
      genero,
      valorInscricao,
      vagasMaximas,
      dataHorario: dataHorario as any,
    });

    return NextResponse.json(nova, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

