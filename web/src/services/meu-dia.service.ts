import { db } from "@/db";
import { categorias, equipeIntegrantes, grupos, partidas, torneios } from "@/db/schema";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { operacaoService, NOME_FASE } from "@/services/operacao.service";
import { presencaAtletaService } from "@/services/presenca-atleta.service";
import { confrontosService } from "@/services/confrontos.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";

/** Duracao media de um jogo quando ainda nao ha jogos encerrados no dia para medir. */
const DURACAO_PADRAO_MIN = 30;

export type SituacaoMeuJogo = "EM_JOGO" | "AQUECIMENTO" | "CHAMADO" | "NA_FILA" | "AGENDADO";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/**
 * "Meu dia de torneio" (app do atleta): o torneio do ponto de vista do atleta logado.
 * Proximo jogo com a situacao ao vivo, posicao na fila e previsao, check-in dele e do parceiro,
 * adversario com o confronto, meus resultados e a classificacao do meu grupo.
 */
export async function meuDiaDeTorneio(params: { torneioId: string; usuarioId: string }) {
  const [torneio] = await db
    .select({
      id: torneios.id,
      nome: torneios.nome,
      slug: torneios.slug,
      operacaoAoVivo: torneios.operacaoAoVivo,
      toleranciaAtrasoMin: torneios.toleranciaAtrasoMin,
      quadrasAtivas: torneios.quadrasAtivas,
    })
    .from(torneios)
    .where(eq(torneios.id, params.torneioId))
    .limit(1);
  if (!torneio) return null;

  // equipes do atleta neste torneio
  const minhasEquipes = (
    await db
      .select({ equipeId: equipeIntegrantes.equipeId })
      .from(equipeIntegrantes)
      .where(eq(equipeIntegrantes.usuarioId, params.usuarioId))
  ).map((e) => e.equipeId);

  const jogos = minhasEquipes.length
    ? await db
        .select({
          id: partidas.id,
          categoriaId: partidas.categoriaId,
          categoriaNome: categorias.nome,
          fase: partidas.fase,
          grupoId: partidas.grupoId,
          grupoNome: grupos.nome,
          status: partidas.status,
          quadra: partidas.quadra,
          dataHorario: partidas.dataHorario,
          chamadoEm: partidas.chamadoEm,
          iniciadoEm: partidas.iniciadoEm,
          aquecimentoMin: partidas.aquecimentoMin,
          finalizadoEm: partidas.finalizadoEm,
          equipeAId: partidas.equipeAId,
          equipeBId: partidas.equipeBId,
          vencedorId: partidas.vencedorId,
          detalhesPlacar: partidas.detalhesPlacar,
        })
        .from(partidas)
        .innerJoin(categorias, eq(categorias.id, partidas.categoriaId))
        .leftJoin(grupos, eq(grupos.id, partidas.grupoId))
        .where(
          and(
            eq(partidas.torneioId, torneio.id),
            ne(partidas.status, "CANCELADA"),
            or(inArray(partidas.equipeAId, minhasEquipes), inArray(partidas.equipeBId, minhasEquipes))
          )
        )
    : [];

  const equipeIds = Array.from(new Set(jogos.flatMap((j) => [j.equipeAId, j.equipeBId])));
  const atletas = equipeIds.length
    ? await equipesDisplayService.mapAtletasEquipes(equipeIds, { categoriaId: Array.from(new Set(jogos.map((j) => j.categoriaId))) })
    : new Map();
  const lado = (j: (typeof jogos)[number]) => (minhasEquipes.includes(j.equipeAId) ? "A" : "B");
  const minhaDupla = (j: (typeof jogos)[number]) => atletas.get(lado(j) === "A" ? j.equipeAId : j.equipeBId) ?? [];
  const adversaria = (j: (typeof jogos)[number]) => atletas.get(lado(j) === "A" ? j.equipeBId : j.equipeAId) ?? [];
  const etapa = (j: (typeof jogos)[number]) => j.grupoNome || NOME_FASE[j.fase] || j.fase;

  // proximo jogo: em quadra primeiro, depois chamado, depois o mais cedo pela ordem de criacao/data
  const pendentes = jogos.filter((j) => j.status === "AGENDADA" || j.status === "EM_ANDAMENTO");
  const prioridade = (j: (typeof jogos)[number]) => (j.status === "EM_ANDAMENTO" ? 0 : j.chamadoEm ? 1 : 2);
  pendentes.sort(
    (a, b) =>
      prioridade(a) - prioridade(b) ||
      (a.dataHorario ? new Date(a.dataHorario).getTime() : Infinity) - (b.dataHorario ? new Date(b.dataHorario).getTime() : Infinity)
  );
  const proximo = pendentes[0] ?? null;

  let proximoJogo = null;
  if (proximo) {
    const agora = Date.now();
    const aquecimentoAte =
      proximo.iniciadoEm && proximo.aquecimentoMin ? new Date(new Date(proximo.iniciadoEm).getTime() + proximo.aquecimentoMin * 60_000) : null;
    let situacao: SituacaoMeuJogo = "AGENDADO";
    if (proximo.status === "EM_ANDAMENTO") situacao = aquecimentoAte && aquecimentoAte.getTime() > agora ? "AQUECIMENTO" : "EM_JOGO";
    else if (proximo.chamadoEm) situacao = "CHAMADO";

    // fila da operacao ao vivo: posicao e previsao
    let fila: { posicao: number; jogosAFrente: number; previsaoEm: string | null; prontoParaChamar: boolean } | null = null;
    if (torneio.operacaoAoVivo && situacao === "AGENDADO") {
      const estado = await operacaoService.estado({ torneioId: torneio.id, categoriaId: proximo.categoriaId });
      const idx = estado.fila.findIndex((j) => j.id === proximo.id);
      if (idx >= 0) {
        situacao = "NA_FILA";
        const media = await duracaoMediaMin(torneio.id);
        const quadras = Math.max(1, estado.quadras.length || torneio.quadrasAtivas || 1);
        // cada "rodada" de quadras leva um jogo medio; quem esta em quadra ja adianta metade
        const rodadas = Math.ceil((idx + 1) / quadras);
        fila = {
          posicao: idx + 1,
          jogosAFrente: idx,
          previsaoEm: new Date(agora + Math.max(0, rodadas - 0.5) * media * 60_000).toISOString(),
          prontoParaChamar: estado.fila[idx].pronto,
        };
      }
    }

    const confronto = await confrontosService.daPartida(proximo.id).catch(() => null);
    const souA = lado(proximo) === "A";
    proximoJogo = {
      id: proximo.id,
      categoria: { id: proximo.categoriaId, nome: proximo.categoriaNome },
      etapa: etapa(proximo),
      situacao,
      quadra: proximo.quadra,
      dataHorario: iso(proximo.dataHorario),
      chamadoEm: iso(proximo.chamadoEm),
      /** ate quando a dupla deve se apresentar depois da chamada */
      toleranciaAte: proximo.chamadoEm ? new Date(new Date(proximo.chamadoEm).getTime() + torneio.toleranciaAtrasoMin * 60_000).toISOString() : null,
      iniciadoEm: iso(proximo.iniciadoEm),
      aquecimentoAte: iso(aquecimentoAte),
      minhaDupla: minhaDupla(proximo),
      adversaria: adversaria(proximo),
      fila,
      // confronto do ponto de vista da minha dupla
      confronto: confronto
        ? {
            duplas: souA
              ? { vitorias: confronto.duplas.vitorias, derrotas: confronto.duplas.derrotas }
              : { vitorias: confronto.duplas.derrotas, derrotas: confronto.duplas.vitorias },
            ultimosEncontros: confronto.duplas.jogos.map((e) => ({ ...e, venceu: souA ? e.venceu : !e.venceu })),
            forma: confronto.forma,
          }
        : null,
    };
  }

  // meus resultados no torneio (mais recente primeiro)
  const resultados = jogos
    .filter((j) => (j.status === "FINALIZADA" || j.status === "WO") && j.vencedorId)
    .sort((a, b) => new Date(b.finalizadoEm ?? 0).getTime() - new Date(a.finalizadoEm ?? 0).getTime())
    .map((j) => {
      const souA = lado(j) === "A";
      const sets = Array.isArray(j.detalhesPlacar)
        ? (j.detalhesPlacar as { a: number; b: number }[]).map((s) => (souA ? `${s.a}-${s.b}` : `${s.b}-${s.a}`))
        : [];
      return {
        id: j.id,
        categoriaNome: j.categoriaNome,
        etapa: etapa(j),
        venceu: minhasEquipes.includes(j.vencedorId!),
        wo: j.status === "WO",
        placar: j.status === "WO" ? "W.O." : sets.join(" "),
        adversaria: adversaria(j),
        finalizadoEm: iso(j.finalizadoEm),
      };
    });

  // classificacao do meu grupo (categoria do proximo jogo, ou do ultimo jogado)
  const referencia = proximo ?? jogos.find((j) => j.grupoId) ?? null;
  let meuGrupo = null;
  if (referencia?.grupoId) {
    const grupos = await classificacaoCategoriaService.obterClassificacao(referencia.categoriaId).catch(() => []);
    const g = grupos.find((x: any) => x.grupoId === referencia.grupoId);
    if (g) {
      meuGrupo = {
        nome: g.grupoNome,
        categoriaNome: referencia.categoriaNome,
        equipes: g.equipes.map((e: any, i: number) => ({
          posicao: i + 1,
          equipeId: e.equipeId,
          nome: e.equipeNome,
          minha: minhasEquipes.includes(e.equipeId),
          jogos: e.jogosJogados ?? 0,
          vitorias: e.jogosVencidos ?? 0,
          saldoGames: e.saldoGames ?? 0,
          pontos: e.pontos ?? 0,
        })),
      };
    }
  }

  // check-in de hoje (o mesmo do app), com o parceiro
  const status = await presencaAtletaService.status(params.usuarioId).catch(() => null);
  const checkin = status?.torneios.find((t) => t.torneio.id === torneio.id) ?? null;

  return {
    torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug, operacaoAoVivo: torneio.operacaoAoVivo },
    agora: new Date().toISOString(),
    checkin: checkin
      ? { presente: checkin.presente, janela: checkin.janela, botaoPermitido: checkin.botaoPermitido, qrPermitido: checkin.qrPermitido, parceiros: checkin.parceiros }
      : null,
    proximoJogo,
    resultados,
    meuGrupo,
  };
}

/** Duracao media (min) dos jogos encerrados hoje no torneio, do inicio ao fim. */
async function duracaoMediaMin(torneioId: string) {
  const desde = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const rows = await db
    .select({ iniciadoEm: partidas.iniciadoEm, finalizadoEm: partidas.finalizadoEm })
    .from(partidas)
    .where(and(eq(partidas.torneioId, torneioId), eq(partidas.status, "FINALIZADA")));
  const duracoes = rows
    .filter((r) => r.iniciadoEm && r.finalizadoEm && new Date(r.finalizadoEm) >= desde)
    .map((r) => (new Date(r.finalizadoEm!).getTime() - new Date(r.iniciadoEm!).getTime()) / 60000)
    .filter((m) => m > 5 && m < 180);
  return duracoes.length ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : DURACAO_PADRAO_MIN;
}
