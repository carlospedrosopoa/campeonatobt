import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; partidaId: string }> }
) {
  try {
    const { slug, partidaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

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

    return NextResponse.json({ error: "AÃ§Ã£o invÃ¡lida" }, { status: 400 });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

