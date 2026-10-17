import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { chamarJogo } from "@/services/operacao.service";

/** Chama um jogo para a quadra: aloca na quadra e registra a hora da chamada. Body: { partidaId, quadraNumero } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const body = await request.json().catch(() => null);
    const partidaId = String(body?.partidaId || "");
    const quadraNumero = Number(body?.quadraNumero);
    if (!partidaId || !quadraNumero) return NextResponse.json({ error: "Informe o jogo e a quadra" }, { status: 400 });
    const partida = await chamarJogo({ torneioId: acesso.torneio.id, partidaId, quadraNumero });
    return NextResponse.json({ ok: true, partida }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
