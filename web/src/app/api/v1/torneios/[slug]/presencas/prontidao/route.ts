import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { presencaService } from "@/services/presenca.service";

// Prontidao (atletas presentes / total) de uma lista de jogos
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.partidaIds) ? (body.partidaIds as unknown[]).map(String) : [];
    const prontidao = await presencaService.prontidao({ torneioId: acesso.torneio.id, partidaIds: ids });
    return NextResponse.json({ prontidao, toleranciaMin: acesso.torneio.toleranciaAtrasoMin ?? 15 });
  } catch (error) {
    console.error("Erro ao calcular prontidao:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
