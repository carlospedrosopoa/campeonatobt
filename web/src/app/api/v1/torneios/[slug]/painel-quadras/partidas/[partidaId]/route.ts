import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; partidaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, partidaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const acao = String(body?.acao || "").trim();

    if (acao === "alocar") {
      const updated = await painelQuadrasService.alocarPartida({
        torneioId: torneio.id,
        partidaId,
        quadraNumero: Number(body?.quadraNumero),
        arenaId: (body?.arenaId as string | null | undefined) ?? null,
      });
      return NextResponse.json(updated);
    }

    if (acao === "retirar") {
      const updated = await painelQuadrasService.retirarDaQuadra({
        torneioId: torneio.id,
        partidaId,
      });
      return NextResponse.json(updated);
    }

    if (acao === "iniciar") {
      const updated = await painelQuadrasService.iniciarPartida({
        torneioId: torneio.id,
        partidaId,
      });
      return NextResponse.json(updated);
    }

    if (acao === "voltar-aguardando") {
      const updated = await painelQuadrasService.voltarParaAguardando({
        torneioId: torneio.id,
        partidaId,
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
