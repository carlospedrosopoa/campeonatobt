import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const painel = await painelQuadrasService.listar(torneio.id);
    return NextResponse.json(painel);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
