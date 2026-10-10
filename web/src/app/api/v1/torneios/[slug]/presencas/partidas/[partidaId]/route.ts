import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { presencaService } from "@/services/presenca.service";

// Conferencia dos atletas de um jogo (arbitro)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string; partidaId: string }> }) {
  try {
    const { slug, partidaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const detalhe = await presencaService.detalhePartida({ torneioId: acesso.torneio.id, partidaId });
    if (!detalhe) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    return NextResponse.json(detalhe);
  } catch (error) {
    console.error("Erro ao carregar conferencia:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// Chamar o jogo (inicia a tolerancia) ou desfazer a chamada
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string; partidaId: string }> }) {
  try {
    const { slug, partidaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const body = await request.json().catch(() => null);
    const acao = String(body?.acao || "");
    if (acao !== "chamar" && acao !== "limpar-chamada") return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    const updated = await presencaService.definirChamada({ torneioId: acesso.torneio.id, partidaId, chamar: acao === "chamar" });
    if (!updated) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao chamar partida:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
