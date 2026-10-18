import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { operacaoDesabilitada } from "@/lib/operacao-texto";
import { salvarAquecimentoPadrao } from "@/services/operacao.service";

/** Ajustes da mesa de controle. Body: { aquecimentoMin } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    if (!acesso.torneio.operacaoAoVivo) return operacaoDesabilitada();
    const body = await request.json().catch(() => null);
    const r = await salvarAquecimentoPadrao({ torneioId: acesso.torneio.id, aquecimentoMin: Number(body?.aquecimentoMin) });
    return NextResponse.json({ ok: true, ...r });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 400 });
  }
}
