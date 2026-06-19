import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const quadrasAtivas = Number(body?.quadrasAtivas);
    if (!Number.isFinite(quadrasAtivas) || quadrasAtivas < 0) {
      return NextResponse.json({ error: "Quantidade de quadras inválida" }, { status: 400 });
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
