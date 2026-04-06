import { db } from "@/db";
import { categorias, grupoEquipes, grupos, partidas, torneios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { equipesDisplayService } from "@/services/equipes-display.service";

type MatchRow = {
  id: string;
  grupoId: string | null;
  equipeAId: string;
  equipeBId: string;
  status: "AGENDADA" | "EM_ANDAMENTO" | "FINALIZADA" | "WO" | "CANCELADA";
  vencedorId: string | null;
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

type TeamStats = {
  equipeId: string;
  pontos: number;
  jogosJogados: number;
  jogosVencidos: number;
  jogosPerdidos: number;
  gamesPro: number;
  gamesContra: number;
  saldoGames: number;
};

function computeGames(det: MatchRow["detalhesPlacar"], opts?: { ignoreSuperTieMin?: number | null }) {
  if (!det || det.length === 0) return null;
  let a = 0;
  let b = 0;
  for (const s of det) {
    const ignoreMin = opts?.ignoreSuperTieMin ?? null;
    if (ignoreMin && s?.tiebreak) {
      const max = Math.max(Number(s.a) || 0, Number(s.b) || 0);
      if (max >= ignoreMin) continue;
    }
    a += Number(s.a) || 0;
    b += Number(s.b) || 0;
  }
  return { a, b };
}

function resolveWinner(m: MatchRow) {
  if (m.vencedorId) return m.vencedorId;
  if (m.status !== "FINALIZADA" && m.status !== "WO") return null;
  const a = m.placarA ?? 0;
  const b = m.placarB ?? 0;
  if (a === b) return null;
  return a > b ? m.equipeAId : m.equipeBId;
}

export class ClassificacaoCategoriaService {
  async recalcularPorCategoria(categoriaId: string) {
    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    const torneioRow = await db
      .select({ superCampeonato: torneios.superCampeonato })
      .from(categorias)
      .innerJoin(torneios, eq(categorias.torneioId, torneios.id))
      .where(eq(categorias.id, categoriaId))
      .limit(1);
    const superCampeonato = torneioRow[0]?.superCampeonato ?? false;
    const ignoreSuperTieMin = superCampeonato
      ? (config.regrasPartida?.superTiebreakDecisivo?.ate ?? 10)
      : config.regrasPartida?.superTiebreakDecisivo?.habilitado && config.regrasPartida?.incluirSuperTieEmGames !== true
        ? config.regrasPartida.superTiebreakDecisivo.ate ?? 10
        : null;

    const gruposRows = await db.select({ id: grupos.id }).from(grupos).where(eq(grupos.categoriaId, categoriaId));
    const grupoIds = gruposRows.map((g) => g.id);
    if (grupoIds.length === 0) {
      return { gruposAtualizados: 0 };
    }

    const equipesRows = await db
      .select({ id: grupoEquipes.id, grupoId: grupoEquipes.grupoId, equipeId: grupoEquipes.equipeId })
      .from(grupoEquipes)
      .where(inArray(grupoEquipes.grupoId, grupoIds));

    const stats = new Map<string, TeamStats>();
    for (const e of equipesRows) {
      const key = `${e.grupoId}:${e.equipeId}`;
      stats.set(key, {
        equipeId: e.equipeId,
        pontos: 0,
        jogosJogados: 0,
        jogosVencidos: 0,
        jogosPerdidos: 0,
        gamesPro: 0,
        gamesContra: 0,
        saldoGames: 0,
      });
    }

    const jogos = (await db
      .select({
        id: partidas.id,
        grupoId: partidas.grupoId,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(and(inArray(partidas.grupoId, grupoIds), eq(partidas.fase, "GRUPOS")))) as unknown as MatchRow[];

    for (const m of jogos) {
      if (!m.grupoId) continue;
      if (m.status !== "FINALIZADA" && m.status !== "WO") continue;

      const keyA = `${m.grupoId}:${m.equipeAId}`;
      const keyB = `${m.grupoId}:${m.equipeBId}`;
      const a = stats.get(keyA);
      const b = stats.get(keyB);
      if (!a || !b) continue;

      a.jogosJogados += 1;
      b.jogosJogados += 1;

      const games = computeGames(m.detalhesPlacar, { ignoreSuperTieMin });
      if (games) {
        a.gamesPro += games.a;
        a.gamesContra += games.b;
        b.gamesPro += games.b;
        b.gamesContra += games.a;
        a.saldoGames = a.gamesPro - a.gamesContra;
        b.saldoGames = b.gamesPro - b.gamesContra;
      }

      const winner = resolveWinner(m);
      const setsA = m.placarA ?? 0;
      const setsB = m.placarB ?? 0;
      const setsMax = Math.max(setsA, setsB);
      const setsMin = Math.min(setsA, setsB);

      const pontosVencedor =
        superCampeonato
          ? setsMax === 2 && setsMin === 1
            ? 2
            : 3
          : 1;

      const pontosPerdedor =
        superCampeonato
          ? setsMax === 2 && setsMin === 1
            ? 1
            : 0
          : 0;

      const pontosVencedorWO = superCampeonato ? 3 : 1;
      if (winner === m.equipeAId) {
        a.jogosVencidos += 1;
        b.jogosPerdidos += 1;
        a.pontos += m.status === "WO" ? pontosVencedorWO : pontosVencedor;
        b.pontos += m.status === "WO" ? 0 : pontosPerdedor;
      } else if (winner === m.equipeBId) {
        b.jogosVencidos += 1;
        a.jogosPerdidos += 1;
        b.pontos += m.status === "WO" ? pontosVencedorWO : pontosVencedor;
        a.pontos += m.status === "WO" ? 0 : pontosPerdedor;
      }
    }

    await db.transaction(async (tx) => {
      for (const e of equipesRows) {
        const key = `${e.grupoId}:${e.equipeId}`;
        const s = stats.get(key);
        if (!s) continue;
        await tx
          .update(grupoEquipes)
          .set({
            pontos: s.pontos,
            jogosJogados: s.jogosJogados,
            jogosVencidos: s.jogosVencidos,
            jogosPerdidos: s.jogosPerdidos,
            saldoGames: s.saldoGames,
          })
          .where(eq(grupoEquipes.id, e.id));
      }
    });

    return { gruposAtualizados: grupoIds.length };
  }

  async obterClassificacao(categoriaId: string) {
    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    const torneioRow = await db
      .select({ superCampeonato: torneios.superCampeonato })
      .from(categorias)
      .innerJoin(torneios, eq(categorias.torneioId, torneios.id))
      .where(eq(categorias.id, categoriaId))
      .limit(1);
    const superCampeonato = torneioRow[0]?.superCampeonato ?? false;

    const desempate = superCampeonato
      ? (["PONTOS", "VITORIAS", "SETS_PRO", "SALDO_GAMES", "SORTEIO"] as any)
      : (config.desempate ?? ["PONTOS", "CONFRONTO_DIRETO", "SALDO_GAMES", "GAMES_PRO", "VITORIAS", "SORTEIO"]);

    const ignoreSuperTieMin = superCampeonato
      ? (config.regrasPartida?.superTiebreakDecisivo?.ate ?? 10)
      : config.regrasPartida?.superTiebreakDecisivo?.habilitado && config.regrasPartida?.incluirSuperTieEmGames !== true
        ? config.regrasPartida.superTiebreakDecisivo.ate ?? 10
        : null;

    const gruposRows = await db.select({ id: grupos.id, nome: grupos.nome }).from(grupos).where(eq(grupos.categoriaId, categoriaId));
    const grupoIds = gruposRows.map((g) => g.id);
    if (grupoIds.length === 0) return [];

    const equipesRows = await db
      .select({
        grupoId: grupoEquipes.grupoId,
        equipeId: grupoEquipes.equipeId,
        pontos: grupoEquipes.pontos,
        jogosJogados: grupoEquipes.jogosJogados,
        jogosVencidos: grupoEquipes.jogosVencidos,
        jogosPerdidos: grupoEquipes.jogosPerdidos,
        saldoGames: grupoEquipes.saldoGames,
      })
      .from(grupoEquipes)
      .where(inArray(grupoEquipes.grupoId, grupoIds));

    const jogos = (await db
      .select({
        id: partidas.id,
        grupoId: partidas.grupoId,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(and(inArray(partidas.grupoId, grupoIds), eq(partidas.fase, "GRUPOS")))) as unknown as MatchRow[];

    const gamesPorEquipe = new Map<string, { pro: number; contra: number; setsPro: number }>();
    for (const m of jogos) {
      if (!m.grupoId) continue;
      if (m.status !== "FINALIZADA" && m.status !== "WO") continue;
      const games = computeGames(m.detalhesPlacar, { ignoreSuperTieMin });
      const keyA = `${m.grupoId}:${m.equipeAId}`;
      const keyB = `${m.grupoId}:${m.equipeBId}`;
      const a = gamesPorEquipe.get(keyA) ?? { pro: 0, contra: 0, setsPro: 0 };
      const b = gamesPorEquipe.get(keyB) ?? { pro: 0, contra: 0, setsPro: 0 };
      if (games) {
        a.pro += games.a;
        a.contra += games.b;
        b.pro += games.b;
        b.contra += games.a;
      }
      a.setsPro += Number(m.placarA ?? 0);
      b.setsPro += Number(m.placarB ?? 0);
      gamesPorEquipe.set(keyA, a);
      gamesPorEquipe.set(keyB, b);
    }

    const headToHeadWinner = (grupoId: string, a: string, b: string) => {
      const match = jogos.find(
        (m) =>
          m.grupoId === grupoId &&
          ((m.equipeAId === a && m.equipeBId === b) || (m.equipeAId === b && m.equipeBId === a)) &&
          (m.status === "FINALIZADA" || m.status === "WO")
      );
      if (!match) return null;
      return resolveWinner(match);
    };

    const byGrupo = new Map<string, { grupoId: string; grupoNome: string; equipes: any[] }>();
    for (const g of gruposRows) byGrupo.set(g.id, { grupoId: g.id, grupoNome: g.nome, equipes: [] });

    const equipeIds = Array.from(new Set(equipesRows.map((e) => e.equipeId)));
    const nomesEquipes = await equipesDisplayService.mapNomesEquipes(equipeIds);

    for (const e of equipesRows) {
      const games = gamesPorEquipe.get(`${e.grupoId}:${e.equipeId}`) ?? { pro: 0, contra: 0, setsPro: 0 };
      byGrupo.get(e.grupoId)?.equipes.push({
        equipeId: e.equipeId,
        equipeNome: nomesEquipes.get(e.equipeId) ?? e.equipeId,
        pontos: e.pontos ?? 0,
        jogosJogados: e.jogosJogados ?? 0,
        jogosVencidos: e.jogosVencidos ?? 0,
        jogosPerdidos: e.jogosPerdidos ?? 0,
        saldoGames: e.saldoGames ?? 0,
        gamesPro: games.pro,
        gamesContra: games.contra,
        setsPro: games.setsPro,
      });
    }

    for (const g of byGrupo.values()) {
      g.equipes.sort((x, y) => {
        for (const crit of desempate) {
          if (crit === "PONTOS") {
            if (y.pontos !== x.pontos) return y.pontos - x.pontos;
          } else if (crit === "VITORIAS") {
            if (y.jogosVencidos !== x.jogosVencidos) return y.jogosVencidos - x.jogosVencidos;
          } else if (crit === "SALDO_GAMES") {
            if (y.saldoGames !== x.saldoGames) return y.saldoGames - x.saldoGames;
          } else if (crit === "SETS_PRO") {
            const spX = x.setsPro ?? 0;
            const spY = y.setsPro ?? 0;
            if (spY !== spX) return spY - spX;
          } else if (crit === "GAMES_PRO") {
            const gamesProX = x.gamesPro ?? 0;
            const gamesProY = y.gamesPro ?? 0;
            if (gamesProY !== gamesProX) return gamesProY - gamesProX;
          } else if (crit === "CONFRONTO_DIRETO") {
            const w = headToHeadWinner(g.grupoId, x.equipeId, y.equipeId);
            if (w === x.equipeId) return -1;
            if (w === y.equipeId) return 1;
          } else if (crit === "SORTEIO") {
            if (x.equipeId !== y.equipeId) return x.equipeId.localeCompare(y.equipeId);
          }
        }
        return 0;
      });
    }

    return Array.from(byGrupo.values());
  }
}

export const classificacaoCategoriaService = new ClassificacaoCategoriaService();
