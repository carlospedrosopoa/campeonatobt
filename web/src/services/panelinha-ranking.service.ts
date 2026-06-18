import { db } from "@/db";
import {
  panelinhaPlays,
  panelinhaPlayJogos,
  panelinhaRankingJogos,
  panelinhaRankingPlays,
  panelinhaRankingSemanas,
  panelinhaRankingTemporadas,
  panelinhaTemporadas,
  panelinhas,
  usuarios,
} from "@/db/schema";
import { isoWeekKey, zonedTimeToUtc } from "@/lib/utils";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { SetScore } from "@/lib/regras-partida";

type RankingTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ConfirmedJogo = {
  id: string;
  playId: string;
  ordem: number;
  detalhesPlacar: SetScore[] | null;
  duplaAAtleta1Id: string;
  duplaAAtleta2Id: string;
  duplaBAtleta1Id: string;
  duplaBAtleta2Id: string;
};

type PlayContext = {
  playId: string;
  panelinhaId: string;
  dataHorario: Date;
  timezone: string;
};

type GameAthleteEntry = {
  jogoId: string;
  atletaId: string;
  semanaKey: string;
  pontuacao: number;
  vitoria: boolean;
  vitoriaTieBreak: boolean;
  derrotaTieBreak: boolean;
  gamesFeitos: number;
  gamesSofridos: number;
  saldoGames: number;
  ocorreuEm: Date;
};

function roundAverage(sum: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((sum / total) * 100) / 100;
}

function decimalString(value: number) {
  return value.toFixed(2);
}

function seasonNameFromPlayDate(playDate: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).formatToParts(playDate);
  return parts.find((item) => item.type === "year")?.value || String(playDate.getUTCFullYear());
}

function seasonStartUtc(playDate: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
  }).formatToParts(playDate);
  const year = Number(parts.find((item) => item.type === "year")?.value || playDate.getUTCFullYear());
  return zonedTimeToUtc({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
}

function pontosPorResultado(set: SetScore) {
  const tieBreak = Boolean(set?.tiebreak);
  const equipeAVenceu = Number(set?.a || 0) > Number(set?.b || 0);
  if (equipeAVenceu) {
    return { equipeA: tieBreak ? 2 : 3, equipeB: tieBreak ? 1 : 0, equipeAVenceu: true, tieBreak };
  }
  return { equipeA: tieBreak ? 1 : 0, equipeB: tieBreak ? 2 : 3, equipeAVenceu: false, tieBreak };
}

function buildEntriesForJogo(play: PlayContext, jogo: ConfirmedJogo): GameAthleteEntry[] {
  const set = Array.isArray(jogo.detalhesPlacar) ? jogo.detalhesPlacar[0] : null;
  if (!set) return [];

  const semanaKey = isoWeekKey(play.dataHorario, play.timezone);
  const gamesA = Number(set.a || 0);
  const gamesB = Number(set.b || 0);
  const pontos = pontosPorResultado(set);

  const equipeA: GameAthleteEntry = {
    jogoId: jogo.id,
    atletaId: jogo.duplaAAtleta1Id,
    semanaKey,
    pontuacao: pontos.equipeA,
    vitoria: pontos.equipeAVenceu,
    vitoriaTieBreak: pontos.equipeAVenceu && pontos.tieBreak,
    derrotaTieBreak: !pontos.equipeAVenceu && pontos.tieBreak,
    gamesFeitos: gamesA,
    gamesSofridos: gamesB,
    saldoGames: gamesA - gamesB,
    ocorreuEm: play.dataHorario,
  };

  const equipeA2: GameAthleteEntry = { ...equipeA, atletaId: jogo.duplaAAtleta2Id };

  const equipeB: GameAthleteEntry = {
    jogoId: jogo.id,
    atletaId: jogo.duplaBAtleta1Id,
    semanaKey,
    pontuacao: pontos.equipeB,
    vitoria: !pontos.equipeAVenceu,
    vitoriaTieBreak: !pontos.equipeAVenceu && pontos.tieBreak,
    derrotaTieBreak: pontos.equipeAVenceu && pontos.tieBreak,
    gamesFeitos: gamesB,
    gamesSofridos: gamesA,
    saldoGames: gamesB - gamesA,
    ocorreuEm: play.dataHorario,
  };

  const equipeB2: GameAthleteEntry = { ...equipeB, atletaId: jogo.duplaBAtleta2Id };

  return [equipeA, equipeA2, equipeB, equipeB2];
}

export class PanelinhaRankingService {
  async recalcularPorPlay(playId: string) {
    return db.transaction(async (tx) => {
      const context = await this.getPlayContext(tx, playId);
      if (!context) return null;

      const temporada = await this.getOrCreateSeasonForPlay(tx, context);
      const jogos = await tx
        .select({
          id: panelinhaPlayJogos.id,
          playId: panelinhaPlayJogos.playId,
          ordem: panelinhaPlayJogos.ordem,
          detalhesPlacar: panelinhaPlayJogos.detalhesPlacar,
          duplaAAtleta1Id: panelinhaPlayJogos.duplaAAtleta1Id,
          duplaAAtleta2Id: panelinhaPlayJogos.duplaAAtleta2Id,
          duplaBAtleta1Id: panelinhaPlayJogos.duplaBAtleta1Id,
          duplaBAtleta2Id: panelinhaPlayJogos.duplaBAtleta2Id,
        })
        .from(panelinhaPlayJogos)
        .where(and(eq(panelinhaPlayJogos.playId, playId), eq(panelinhaPlayJogos.status, "CONFIRMADO")))
        .orderBy(asc(panelinhaPlayJogos.ordem));

      await tx.delete(panelinhaRankingJogos).where(eq(panelinhaRankingJogos.playId, playId));
      await tx.delete(panelinhaRankingPlays).where(eq(panelinhaRankingPlays.playId, playId));

      const gameEntries = jogos.flatMap((jogo) => buildEntriesForJogo(context, jogo as ConfirmedJogo));
      if (gameEntries.length > 0) {
        await tx.insert(panelinhaRankingJogos).values(
          gameEntries.map((entry) => ({
            panelinhaId: context.panelinhaId,
            temporadaId: temporada.id,
            playId,
            jogoId: entry.jogoId,
            atletaId: entry.atletaId,
            semanaKey: entry.semanaKey,
            pontuacao: entry.pontuacao,
            vitoria: entry.vitoria,
            vitoriaTieBreak: entry.vitoriaTieBreak,
            derrotaTieBreak: entry.derrotaTieBreak,
            gamesFeitos: entry.gamesFeitos,
            gamesSofridos: entry.gamesSofridos,
            saldoGames: entry.saldoGames,
            ocorreuEm: entry.ocorreuEm,
            atualizadoEm: new Date(),
          }))
        );
      }

      const byAtleta = new Map<string, GameAthleteEntry[]>();
      for (const entry of gameEntries) {
        const current = byAtleta.get(entry.atletaId) ?? [];
        current.push(entry);
        byAtleta.set(entry.atletaId, current);
      }

      const playRows = Array.from(byAtleta.entries()).map(([atletaId, entries]) => ({
        panelinhaId: context.panelinhaId,
        temporadaId: temporada.id,
        playId,
        atletaId,
        semanaKey: entries[0]?.semanaKey ?? isoWeekKey(context.dataHorario, context.timezone),
        pontuacao: decimalString(roundAverage(entries.reduce((sum, item) => sum + item.pontuacao, 0), entries.length)),
        jogos: entries.length,
        vitorias: entries.filter((item) => item.vitoria).length,
        saldoGames: entries.reduce((sum, item) => sum + item.saldoGames, 0),
        primeiroJogoEm: entries.reduce((min, item) => (item.ocorreuEm < min ? item.ocorreuEm : min), entries[0]?.ocorreuEm ?? context.dataHorario),
        atualizadoEm: new Date(),
      }));

      if (playRows.length > 0) {
        await tx.insert(panelinhaRankingPlays).values(playRows);
      }

      await this.rebuildWeeklyAndSeasonSnapshots(tx, context.panelinhaId, temporada.id);
      return temporada;
    });
  }

  async temporadaPermiteResultados(playId: string) {
    const context = await this.getPlayContext(db as any, playId);
    if (!context) return true;
    const temporada = await this.findSeasonForPlay(db as any, context);
    return !temporada || temporada.status === "ABERTA";
  }

  async obterRanking(panelinhaId: string, temporadaId?: string | null) {
    const season = temporadaId
      ? await db
          .select()
          .from(panelinhaTemporadas)
          .where(and(eq(panelinhaTemporadas.id, temporadaId), eq(panelinhaTemporadas.panelinhaId, panelinhaId)))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : (await db
          .select()
          .from(panelinhaTemporadas)
          .where(and(eq(panelinhaTemporadas.panelinhaId, panelinhaId), eq(panelinhaTemporadas.status, "ABERTA")))
          .orderBy(desc(panelinhaTemporadas.inicioEm))
          .limit(1)
          .then((rows) => rows[0] ?? null)) ??
        (await db
          .select()
          .from(panelinhaTemporadas)
          .where(eq(panelinhaTemporadas.panelinhaId, panelinhaId))
          .orderBy(desc(panelinhaTemporadas.inicioEm))
          .limit(1)
          .then((rows) => rows[0] ?? null));

    if (!season) return { temporada: null, ranking: [], atletas: [] };

    const rows = await db
      .select({
        atletaId: panelinhaRankingTemporadas.atletaId,
        pontuacaoTotal: panelinhaRankingTemporadas.pontuacaoTotal,
        semanasPontuadas: panelinhaRankingTemporadas.semanasPontuadas,
        qtdPlaysTotal: panelinhaRankingTemporadas.qtdPlaysTotal,
        vitoriasTotal: panelinhaRankingTemporadas.vitoriasTotal,
        saldoGamesTotal: panelinhaRankingTemporadas.saldoGamesTotal,
        primeiroPlayEm: panelinhaRankingTemporadas.primeiroPlayEm,
        posicao: panelinhaRankingTemporadas.posicao,
      })
      .from(panelinhaRankingTemporadas)
      .where(eq(panelinhaRankingTemporadas.temporadaId, season.id))
      .orderBy(
        asc(panelinhaRankingTemporadas.posicao),
        desc(panelinhaRankingTemporadas.pontuacaoTotal),
        desc(panelinhaRankingTemporadas.qtdPlaysTotal),
        desc(panelinhaRankingTemporadas.vitoriasTotal),
        desc(panelinhaRankingTemporadas.saldoGamesTotal),
        asc(panelinhaRankingTemporadas.primeiroPlayEm),
      );

    const atletaIds = rows.map((row) => row.atletaId);
    const atletas = atletaIds.length
      ? await db
          .select({ id: usuarios.id, nome: usuarios.nome, fotoUrl: usuarios.fotoUrl })
          .from(usuarios)
          .where(inArray(usuarios.id, atletaIds))
      : [];
    const atletasMap = new Map(atletas.map((item) => [item.id, item]));

    return {
      temporada: season,
      ranking: rows.map((row) => ({
        ...row,
        atletaNome: atletasMap.get(row.atletaId)?.nome ?? "Atleta",
        atletaFotoUrl: atletasMap.get(row.atletaId)?.fotoUrl ?? null,
      })),
      atletas,
    };
  }

  async listarSemanasAtleta(temporadaId: string, atletaId: string) {
    const rows = await db
      .select({
        semanaKey: panelinhaRankingSemanas.semanaKey,
        pontuacaoSemana: panelinhaRankingSemanas.pontuacaoSemana,
        bestPlayId: panelinhaRankingSemanas.bestPlayId,
        qtdPlaysSemana: panelinhaRankingSemanas.qtdPlaysSemana,
        vitoriasSemana: panelinhaRankingSemanas.vitoriasSemana,
        saldoGamesSemana: panelinhaRankingSemanas.saldoGamesSemana,
        primeiroPlayEm: panelinhaRankingSemanas.primeiroPlayEm,
        bestPlayDataHorario: panelinhaPlays.dataHorario,
        bestPlayQuadra: panelinhaPlays.quadra,
        bestPlayArenaNome: panelinhaPlays.arenaNome,
      })
      .from(panelinhaRankingSemanas)
      .leftJoin(panelinhaPlays, eq(panelinhaPlays.id, panelinhaRankingSemanas.bestPlayId))
      .where(and(eq(panelinhaRankingSemanas.temporadaId, temporadaId), eq(panelinhaRankingSemanas.atletaId, atletaId)))
      .orderBy(desc(panelinhaRankingSemanas.semanaKey));

    return rows;
  }

  private async getPlayContext(tx: RankingTx, playId: string): Promise<PlayContext | null> {
    const [play] = await tx
      .select({
        playId: panelinhaPlays.id,
        panelinhaId: panelinhaPlays.panelinhaId,
        dataHorario: panelinhaPlays.dataHorario,
        timezone: panelinhas.timezone,
      })
      .from(panelinhaPlays)
      .innerJoin(panelinhas, eq(panelinhas.id, panelinhaPlays.panelinhaId))
      .where(eq(panelinhaPlays.id, playId))
      .limit(1);

    if (!play) return null;
    return {
      playId: play.playId,
      panelinhaId: play.panelinhaId,
      dataHorario: new Date(play.dataHorario),
      timezone: play.timezone,
    };
  }

  private async findSeasonForPlay(tx: RankingTx, context: PlayContext) {
    const [season] = await tx
      .select()
      .from(panelinhaTemporadas)
      .where(
        and(
          eq(panelinhaTemporadas.panelinhaId, context.panelinhaId),
          lte(panelinhaTemporadas.inicioEm, context.dataHorario),
          or(isNull(panelinhaTemporadas.fimEm), gte(panelinhaTemporadas.fimEm, context.dataHorario))
        )
      )
      .orderBy(desc(panelinhaTemporadas.inicioEm))
      .limit(1);
    return season ?? null;
  }

  private async getOrCreateSeasonForPlay(tx: RankingTx, context: PlayContext) {
    const existing = await this.findSeasonForPlay(tx, context);
    if (existing) return existing;

    const [open] = await tx
      .select()
      .from(panelinhaTemporadas)
      .where(and(eq(panelinhaTemporadas.panelinhaId, context.panelinhaId), eq(panelinhaTemporadas.status, "ABERTA")))
      .orderBy(desc(panelinhaTemporadas.inicioEm))
      .limit(1);
    if (open) return open;

    const [created] = await tx
      .insert(panelinhaTemporadas)
      .values({
        panelinhaId: context.panelinhaId,
        nome: seasonNameFromPlayDate(context.dataHorario, context.timezone),
        inicioEm: seasonStartUtc(context.dataHorario, context.timezone),
        status: "ABERTA",
        timezone: context.timezone,
        atualizadoEm: new Date(),
      })
      .returning();
    return created;
  }

  private async rebuildWeeklyAndSeasonSnapshots(tx: RankingTx, panelinhaId: string, temporadaId: string) {
    const playRows = await tx
      .select()
      .from(panelinhaRankingPlays)
      .where(and(eq(panelinhaRankingPlays.panelinhaId, panelinhaId), eq(panelinhaRankingPlays.temporadaId, temporadaId)))
      .orderBy(asc(panelinhaRankingPlays.primeiroJogoEm));

    await tx.delete(panelinhaRankingSemanas).where(eq(panelinhaRankingSemanas.temporadaId, temporadaId));
    await tx.delete(panelinhaRankingTemporadas).where(eq(panelinhaRankingTemporadas.temporadaId, temporadaId));

    const weeklyMap = new Map<string, typeof playRows>();
    for (const row of playRows) {
      const key = `${row.atletaId}:${row.semanaKey}`;
      const current = weeklyMap.get(key) ?? [];
      current.push(row);
      weeklyMap.set(key, current);
    }

    const weeklyRows = Array.from(weeklyMap.entries()).map(([key, rows]) => {
      const [atletaId, semanaKey] = key.split(":");
      const ordered = rows.slice().sort((a, b) => {
        if (Number(b.pontuacao) !== Number(a.pontuacao)) return Number(b.pontuacao) - Number(a.pontuacao);
        return new Date(a.primeiroJogoEm).getTime() - new Date(b.primeiroJogoEm).getTime();
      });
      const best = ordered[0];
      return {
        panelinhaId,
        temporadaId,
        atletaId,
        semanaKey,
        pontuacaoSemana: decimalString(Number(best?.pontuacao || 0)),
        bestPlayId: best?.playId ?? null,
        qtdPlaysSemana: rows.length,
        vitoriasSemana: rows.reduce((sum, item) => sum + Number(item.vitorias || 0), 0),
        saldoGamesSemana: rows.reduce((sum, item) => sum + Number(item.saldoGames || 0), 0),
        primeiroPlayEm: rows.reduce(
          (min, item) => (new Date(item.primeiroJogoEm) < min ? new Date(item.primeiroJogoEm) : min),
          new Date(rows[0]!.primeiroJogoEm)
        ),
        atualizadoEm: new Date(),
      };
    });

    if (weeklyRows.length > 0) {
      await tx.insert(panelinhaRankingSemanas).values(weeklyRows);
    }

    const seasonMap = new Map<string, typeof weeklyRows>();
    for (const row of weeklyRows) {
      const current = seasonMap.get(row.atletaId) ?? [];
      current.push(row);
      seasonMap.set(row.atletaId, current);
    }

    const seasonRows = Array.from(seasonMap.entries()).map(([atletaId, rows]) => ({
      panelinhaId,
      temporadaId,
      atletaId,
      pontuacaoTotal: decimalString(rows.reduce((sum, item) => sum + Number(item.pontuacaoSemana || 0), 0)),
      semanasPontuadas: rows.length,
      qtdPlaysTotal: rows.reduce((sum, item) => sum + Number(item.qtdPlaysSemana || 0), 0),
      vitoriasTotal: rows.reduce((sum, item) => sum + Number(item.vitoriasSemana || 0), 0),
      saldoGamesTotal: rows.reduce((sum, item) => sum + Number(item.saldoGamesSemana || 0), 0),
      primeiroPlayEm: rows.reduce((min, item) => (item.primeiroPlayEm < min ? item.primeiroPlayEm : min), rows[0]!.primeiroPlayEm),
      atualizadoEm: new Date(),
    }));

    seasonRows.sort((a, b) => {
      if (Number(b.pontuacaoTotal) !== Number(a.pontuacaoTotal)) return Number(b.pontuacaoTotal) - Number(a.pontuacaoTotal);
      if (b.qtdPlaysTotal !== a.qtdPlaysTotal) return b.qtdPlaysTotal - a.qtdPlaysTotal;
      if (b.vitoriasTotal !== a.vitoriasTotal) return b.vitoriasTotal - a.vitoriasTotal;
      if (b.saldoGamesTotal !== a.saldoGamesTotal) return b.saldoGamesTotal - a.saldoGamesTotal;
      return a.primeiroPlayEm.getTime() - b.primeiroPlayEm.getTime();
    });

    if (seasonRows.length > 0) {
      await tx.insert(panelinhaRankingTemporadas).values(
        seasonRows.map((row, index) => ({
          ...row,
          posicao: index + 1,
        }))
      );
    }
  }
}

export const panelinhaRankingService = new PanelinhaRankingService();
