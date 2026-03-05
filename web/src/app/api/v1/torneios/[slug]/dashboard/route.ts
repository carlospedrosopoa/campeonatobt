import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { dashboardAdminService } from "@/services/dashboard-admin.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

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

