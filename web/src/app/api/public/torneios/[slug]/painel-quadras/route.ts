import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { painelQuadrasService } from "@/services/painel-quadras.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";

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

function chaveClassificacao(params: { categoriaId: string; grupoId: string }) {
  return `${params.categoriaId}::${params.grupoId}`;
}

function escopoClassificacaoQuadra(quadra: {
  reservaChave: { categoriaId: string; fase: string; grupoId: string | null; grupoNome: string | null } | null;
  partidaAtual: { categoriaId: string; fase: string; grupoId: string | null; grupoNome: string | null } | null;
  proximaPartidaReserva: { categoriaId: string; fase: string; grupoId: string | null; grupoNome: string | null } | null;
}) {
  if (quadra.reservaChave?.fase === "GRUPOS" && quadra.reservaChave.grupoId) {
    return {
      categoriaId: quadra.reservaChave.categoriaId,
      grupoId: quadra.reservaChave.grupoId,
      grupoNome: quadra.reservaChave.grupoNome,
    };
  }

  if (quadra.partidaAtual?.fase === "GRUPOS" && quadra.partidaAtual.grupoId) {
    return {
      categoriaId: quadra.partidaAtual.categoriaId,
      grupoId: quadra.partidaAtual.grupoId,
      grupoNome: quadra.partidaAtual.grupoNome,
    };
  }

  if (quadra.proximaPartidaReserva?.fase === "GRUPOS" && quadra.proximaPartidaReserva.grupoId) {
    return {
      categoriaId: quadra.proximaPartidaReserva.categoriaId,
      grupoId: quadra.proximaPartidaReserva.grupoId,
      grupoNome: quadra.proximaPartidaReserva.grupoNome,
    };
  }

  return null;
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
  const escoposClassificacao = painel.quadras.map(escopoClassificacaoQuadra).filter(Boolean) as {
    categoriaId: string;
    grupoId: string;
    grupoNome: string | null;
  }[];

  const categoriaIdsClassificacao = Array.from(new Set(escoposClassificacao.map((item) => item.categoriaId)));
  const gruposClassificacaoPorChave = new Map<
    string,
    {
      grupoId: string;
      grupoNome: string;
      equipes: {
        equipeId: string;
        equipeNome: string;
        pontos: number;
        jogosJogados: number;
        jogosVencidos: number;
        jogosPerdidos: number;
        saldoGames: number;
        gamesPro: number;
        setsPro: number;
      }[];
    }
  >();

  if (categoriaIdsClassificacao.length > 0) {
    const classificacoes = await Promise.all(
      categoriaIdsClassificacao.map(async (categoriaId) => ({
        categoriaId,
        grupos: await classificacaoCategoriaService.obterClassificacao(categoriaId),
      }))
    );

    for (const classificacao of classificacoes) {
      for (const grupo of classificacao.grupos) {
        gruposClassificacaoPorChave.set(chaveClassificacao({ categoriaId: classificacao.categoriaId, grupoId: grupo.grupoId }), {
          grupoId: grupo.grupoId,
          grupoNome: grupo.grupoNome,
          equipes: grupo.equipes.map((equipe) => ({
            equipeId: equipe.equipeId,
            equipeNome: equipe.equipeNome || equipe.equipeId,
            pontos: equipe.pontos ?? 0,
            jogosJogados: equipe.jogosJogados ?? 0,
            jogosVencidos: equipe.jogosVencidos ?? 0,
            jogosPerdidos: equipe.jogosPerdidos ?? 0,
            saldoGames: equipe.saldoGames ?? 0,
            gamesPro: equipe.gamesPro ?? 0,
            setsPro: equipe.setsPro ?? 0,
          })),
        });
      }
    }
  }

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
    quadras: painel.quadras.map((quadra) => {
      const escopoClassificacao = escopoClassificacaoQuadra(quadra);
      const classificacaoGrupo =
        escopoClassificacao
          ? gruposClassificacaoPorChave.get(
              chaveClassificacao({
                categoriaId: escopoClassificacao.categoriaId,
                grupoId: escopoClassificacao.grupoId,
              })
            ) ?? null
          : null;

      return {
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
        filaPartidas: quadra.filaPartidas.map(mapPartidaPublica).filter(Boolean),
        classificacaoGrupo: classificacaoGrupo
          ? {
              modelo: torneio.superCampeonato ? "SUPER" : "NORMAL",
              grupoNome: classificacaoGrupo.grupoNome,
              criterioResumo: torneio.superCampeonato
                ? "Pontos, vitorias, sets pro e saldo de games"
                : "Vitorias, saldo de games, confronto direto e games pro",
              equipes: classificacaoGrupo.equipes.map((equipe, index) => ({
                posicao: index + 1,
                equipeId: equipe.equipeId,
                equipeNome: equipe.equipeNome,
                pontos: equipe.pontos,
                jogosJogados: equipe.jogosJogados,
                jogosVencidos: equipe.jogosVencidos,
                jogosPerdidos: equipe.jogosPerdidos,
                saldoGames: equipe.saldoGames,
                gamesPro: equipe.gamesPro,
                setsPro: equipe.setsPro,
              })),
            }
          : null,
      };
    }),
  };

  return NextResponse.json(payload, { headers: corsHeaders() });
}
