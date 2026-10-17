import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { iniciarJogo } from "@/services/operacao.service";

/** "Comecou": marca o inicio do jogo chamado. Body: { partidaId } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const body = await request.json().catch(() => null);
    const partidaId = String(body?.partidaId || "");
    if (!partidaId) return NextResponse.json({ error: "Informe o jogo" }, { status: 400 });
    const partida = await iniciarJogo({ torneioId: acesso.torneio.id, partidaId });
    return NextResponse.json({ ok: true, partida }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
