import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  } as Record<string, string>;
}

function resumoFase(partida: { fase: string; grupoNome?: string | null }) {
  if (partida.fase === "GRUPOS" && partida.grupoNome) return partida.grupoNome;
  return partida.fase;
}

function mapPartidaPublica(
  partida: {
    id: string;
    categoriaNome: string;
    fase: string;
    grupoNome: string | null;
    status: string;
    arenaNome: string | null;
    dataHorario: string | null;
    iniciadoEm: string | null;
    finalizadoEm: string | null;
    equipeANome: string | null;
    equipeBNome: string | null;
    placarA: number;
    placarB: number;
    quadra: string | null;
  } | null
) {
  if (!partida) return null;
  return {
    id: partida.id,
    categoriaNome: partida.categoriaNome,
    fase: partida.fase,
    faseResumo: resumoFase(partida),
    status: partida.status,
    arenaNome: partida.arenaNome,
    dataHorario: partida.dataHorario,
    iniciadoEm: partida.iniciadoEm,
    finalizadoEm: partida.finalizadoEm,
    equipeANome: partida.equipeANome,
    equipeBNome: partida.equipeBNome,
    placarA: partida.placarA,
    placarB: partida.placarB,
    quadra: partida.quadra,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);
  if (!torneio || torneio.oculto) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404, headers: corsHeaders() });
  }

  const painel = await painelQuadrasService.listar(torneio.id);

  const payload = {
    atualizadoEm: new Date().toISOString(),
    refreshMs: 180000,
    torneio: {
      id: painel.torneio.id,
      nome: painel.torneio.nome,
      slug: painel.torneio.slug,
      quadrasAtivas: painel.torneio.quadrasAtivas,
    },
    stats: painel.stats,
    quadras: painel.quadras.map((quadra) => ({
      numero: quadra.numero,
      nome: quadra.nome,
      reservaChave: quadra.reservaChave
        ? {
            descricao: quadra.reservaChave.descricao,
            categoriaNome: quadra.reservaChave.categoriaNome,
            fase: quadra.reservaChave.fase,
            grupoNome: quadra.reservaChave.grupoNome,
            partidasPendentes: quadra.reservaChave.partidasPendentes,
            partidasEmAndamento: quadra.reservaChave.partidasEmAndamento,
            totalEmAberto: quadra.reservaChave.totalEmAberto,
          }
        : null,
      partidaAtual: mapPartidaPublica(quadra.partidaAtual),
      proximaPartidaPrevista: mapPartidaPublica(quadra.proximaPartidaReserva),
    })),
  };

  return NextResponse.json(payload, { headers: corsHeaders() });
}
