import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { operacaoDesabilitada } from "@/lib/operacao-texto";
import { iniciarJogo } from "@/services/operacao.service";

/** "Comecou": marca o inicio do jogo chamado. Body: { partidaId, aquecimentoMin? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    if (!acesso.torneio.operacaoAoVivo) return operacaoDesabilitada();
    const body = await request.json().catch(() => null);
    const partidaId = String(body?.partidaId || "");
    if (!partidaId) return NextResponse.json({ error: "Informe o jogo" }, { status: 400 });
    const aquecimentoMin = body?.aquecimentoMin == null ? null : Number(body.aquecimentoMin);
    const partida = await iniciarJogo({ torneioId: acesso.torneio.id, partidaId, aquecimentoMin });
    return NextResponse.json({ ok: true, partida }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
