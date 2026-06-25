import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { dashboardAdminService } from "@/services/dashboard-admin.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categorias = await dashboardAdminService.resumoCategoriasPorTorneio(torneio.id);
    const stats = categorias.reduce(
      (acc, c) => {
        acc.categoriasTotal += 1;
        acc.inscricoesTotal += c.inscricoesTotal;
        acc.inscricoesPendentes += c.inscricoesPendentes;
        acc.inscricoesAprovadas += c.inscricoesAprovadas;
        acc.inscricoesFilaEspera += c.inscricoesFilaEspera;
        acc.inscricoesRecusadas += c.inscricoesRecusadas;
        return acc;
      },
      {
        categoriasTotal: 0,
        inscricoesTotal: 0,
        inscricoesPendentes: 0,
        inscricoesAprovadas: 0,
        inscricoesFilaEspera: 0,
        inscricoesRecusadas: 0,
      }
    );

    return NextResponse.json({ torneio, stats, categorias });
  } catch (error) {
    console.error("Erro ao carregar dashboard do torneio:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}


