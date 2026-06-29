﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = await request.json().catch(() => null);
    const quadrasAtivas = Number(body?.quadrasAtivas);
    if (!Number.isFinite(quadrasAtivas) || quadrasAtivas < 0) {
      return NextResponse.json({ error: "Quantidade de quadras invÃ¡lida" }, { status: 400 });
    }

    const updated = await painelQuadrasService.salvarConfigQuadras({
      torneioId: torneio.id,
      quadrasAtivas,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

