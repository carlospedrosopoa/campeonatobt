import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { operacaoDesabilitada } from "@/lib/operacao-texto";
import { adiarJogo } from "@/services/operacao.service";

/** "Pular": tira o jogo das sugestoes por alguns minutos. Body: { partidaId, minutos } (0 libera) */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    if (!acesso.torneio.operacaoAoVivo) return operacaoDesabilitada();
    const body = await request.json().catch(() => null);
    const partidaId = String(body?.partidaId || "");
    if (!partidaId) return NextResponse.json({ error: "Informe o jogo" }, { status: 400 });
    const r = await adiarJogo({ torneioId: acesso.torneio.id, partidaId, minutos: Number(body?.minutos ?? 10) });
    return NextResponse.json({ ok: true, ...r });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
