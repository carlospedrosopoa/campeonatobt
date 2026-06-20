import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; quadraNumero: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, quadraNumero } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const acao = String(body?.acao || "").trim();

    if (acao === "reservar-chave") {
      const categoriaId = String(body?.categoriaId || "").trim();
      const fase = String(body?.fase || "").trim();
      const grupoId = typeof body?.grupoId === "string" ? body.grupoId.trim() : "";
      if (!categoriaId || !fase) {
        return NextResponse.json({ error: "Chave inválida para reserva" }, { status: 400 });
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

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
