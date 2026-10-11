import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { gerarTokenCheckin } from "@/lib/checkin-qr";
import { getAppAtletaUrl } from "@/lib/app-atleta-url";
import { dataSP, dataValida } from "@/services/presenca.service";

// QR do dia para imprimir: abre o check-in no app do atleta
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const data = dataValida(new URL(request.url).searchParams.get("data")) ?? dataSP();
    const token = gerarTokenCheckin(acesso.torneio.id, data);
    const url = `${getAppAtletaUrl()}/app/atleta/checkin?t=${encodeURIComponent(acesso.torneio.slug)}&k=${token}`;
    return NextResponse.json({ data, url, torneio: { nome: acesso.torneio.nome, slug: acesso.torneio.slug }, checkinModo: acesso.torneio.checkinModo });
  } catch (error) {
    console.error("Erro ao gerar QR de check-in:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
