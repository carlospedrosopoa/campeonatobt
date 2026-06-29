﻿import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const existe = await categoriasService.buscarPorId(categoriaId);
    if (!existe || existe.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const nome = (body?.nome as string | undefined)?.trim();
    const genero = body?.genero as "MASCULINO" | "FEMININO" | "MISTO" | undefined;
    const valorInscricao = body?.valorInscricao as string | number | null | undefined;
    const vagasMaximas = body?.vagasMaximas as number | null | undefined;
    const dataHorarioRaw = body?.dataHorario as string | null | undefined;
    const dataHorario = dataHorarioRaw ? new Date(dataHorarioRaw) : dataHorarioRaw === null ? null : undefined;
    if (dataHorario instanceof Date && Number.isNaN(dataHorario.getTime())) {
      return NextResponse.json({ error: "Data/hora invÃ¡lida" }, { status: 400 });
    }

    const atualizado = await categoriasService.atualizar(categoriaId, {
      nome,
      genero,
      valorInscricao,
      vagasMaximas,
      dataHorario: dataHorario as any,
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
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const existe = await categoriasService.buscarPorId(categoriaId);
    if (!existe || existe.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    await categoriasService.excluir(categoriaId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

