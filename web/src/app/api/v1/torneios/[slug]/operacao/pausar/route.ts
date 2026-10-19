import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { operacaoDesabilitada } from "@/lib/operacao-texto";
import { pausarAtleta } from "@/services/operacao.service";

/** Pausa ou volta um atleta (nao entra em jogo enquanto pausado). Body: { usuarioId, pausado } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    if (!acesso.torneio.operacaoAoVivo) return operacaoDesabilitada();
    const body = await request.json().catch(() => null);
    const usuarioId = String(body?.usuarioId || "");
    if (!usuarioId) return NextResponse.json({ error: "Informe o atleta" }, { status: 400 });
    const r = await pausarAtleta({ torneioId: acesso.torneio.id, usuarioId, pausado: body?.pausado === true, registradoPor: String(acesso.user.id) });
    return NextResponse.json({ ok: true, ...r });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
