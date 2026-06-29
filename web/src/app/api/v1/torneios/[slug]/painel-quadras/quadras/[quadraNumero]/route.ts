﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; quadraNumero: string }> }
) {
  try {
    const { slug, quadraNumero } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = await request.json().catch(() => null);
    const acao = String(body?.acao || "").trim();

    if (acao === "reservar-chave") {
      const categoriaId = String(body?.categoriaId || "").trim();
      const fase = String(body?.fase || "").trim();
      const grupoId = typeof body?.grupoId === "string" ? body.grupoId.trim() : "";
      if (!categoriaId || !fase) {
        return NextResponse.json({ error: "Chave invÃ¡lida para reserva" }, { status: 400 });
      }

      const updated = await painelQuadrasService.reservarQuadraParaChave({
        torneioId: torneio.id,
        quadraNumero: Number(quadraNumero),
        categoriaId,
        fase,
        grupoId: grupoId || null,
      });
      return NextResponse.json(updated);
    }

    if (acao === "liberar-chave") {
      const updated = await painelQuadrasService.liberarReservaQuadra({
        torneioId: torneio.id,
        quadraNumero: Number(quadraNumero),
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "AÃ§Ã£o invÃ¡lida" }, { status: 400 });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

