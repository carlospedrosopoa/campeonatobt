import { db } from "@/db";
import { categorias, equipes, inscricoes, partidas, placarSubmissoes, torneios } from "@/db/schema";
import { and, eq, inArray, not, or } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";
import { deveInvalidarCardPartida, excluirCardPartidaDoGcs } from "@/services/partida-card-cache.service";

type Fase = "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL" | "TERCEIRO_LUGAR";
type FaseProgressiva = Exclude<Fase, "TERCEIRO_LUGAR">;
type QualifiedSeed = {
  equipeId: string;
  grupoId: string;
  grupoNome?: string;
  equipeNome?: string;
  rankGrupo: number;
  pontos: number;
  saldoGames: number;
  gamesPro: number;
  setsPro: number;
  vitorias: number;
};

type ManualTieBreakGroupItem = {
  equipeId: string;
  equipeNome: string;
  grupoId: string;
  grupoNome: string;
  rankGrupo: number;
  pontos: number;
  saldoGames: number;
  gamesPro: number;
  setsPro: number;
  vitorias: number;
};

type ManualTieBreakGroup = {
  key: string;
  label: string;
  rankGrupo: number;
  items: ManualTieBreakGroupItem[];
};

class ManualTieBreakRequiredError extends Error {
  code = "TIE_BREAK_REQUIRED" as const;
  tieGroups: ManualTieBreakGroup[];

  constructor(tieGroups: ManualTieBreakGroup[]) {
    super("Existe empate tecnico entre campanhas de grupos. Defina a ordem manual para gerar o mata-mata.");
    this.tieGroups = tieGroups;
  }
}

function isPowerOfTwo(n: number) {
  return n > 0 && (n & (n - 1)) === 0;
}

function getNextPowerOfTwo(n: number): number {
  if (isPowerOfTwo(n)) return n;
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}

function faseParaQuantidade(n: number): FaseProgressiva {
  if (n === 2) return "FINAL";
  if (n === 6) return "QUARTAS";
  if (n === 4) return "SEMI";
  if (n === 8) return "QUARTAS";
  return "OITAVAS";
}

const ordemFases: FaseProgressiva[] = ["OITAVAS", "QUARTAS", "SEMI", "FINAL"];

function proximaFase(fase: Fase): FaseProgressiva | null {
  if (fase === "TERCEIRO_LUGAR") return null;
  const idx = ordemFases.indexOf(fase);
  if (idx < 0) return null;
  return ordemFases[idx + 1] ?? null;
}

function partidaIniciada(p: { status?: any; vencedorId?: any; placarA?: any; placarB?: any; detalhesPlacar?: any }) {
  if (p.status && p.status !== "AGENDADA") return true;
  if (p.vencedorId) return true;
  if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
  if (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0) return true;
  return false;
}

export class MataMataService {
  private mesmaCampanha(a: QualifiedSeed, b: QualifiedSeed, superCampeonato: boolean) {
    if (superCampeonato) {
      return (
        a.pontos === b.pontos &&
        a.vitorias === b.vitorias &&
        a.setsPro === b.setsPro &&
        a.saldoGames === b.saldoGames
      );
    }

    return a.vitorias === b.vitorias && a.saldoGames === b.saldoGames && a.gamesPro === b.gamesPro;
  }

  private labelRankGrupo(rankGrupo: number) {
    if (rankGrupo === 1) return "1ºs colocados";
    if (rankGrupo === 2) return "2ºs colocados";
    if (rankGrupo === 3) return "3ºs colocados";
    if (rankGrupo === 999) return "melhores terceiros";
    return `${rankGrupo}ºs colocados`;
  }

  private normalizarKeyDesempateManual(label: string, ids: string[]) {
    return `${label}::${[...ids].sort((a, b) => a.localeCompare(b)).join("|")}`;
  }

  private ordenarCandidatosComDesempateManual(params: {
    items: QualifiedSeed[];
    label: string;
    superCampeonato: boolean;
    manualTieBreaks?: Record<string, string[]>;
  }) {
    const sorted = [...params.items].sort((a, b) => {
      const cmp = this.compararQualificadosPorCampanha(a, b, params.superCampeonato);
      if (cmp !== 0) return cmp;
      return a.equipeId.localeCompare(b.equipeId);
    });
    const unresolved: ManualTieBreakGroup[] = [];
    const ordered: QualifiedSeed[] = [];

    let index = 0;
    while (index < sorted.length) {
      let nextIndex = index + 1;
      while (
        nextIndex < sorted.length &&
        this.mesmaCampanha(sorted[index], sorted[nextIndex], params.superCampeonato)
      ) {
        nextIndex += 1;
      }

      const bloco = sorted.slice(index, nextIndex);
      if (bloco.length === 1) {
        ordered.push(bloco[0]);
        index = nextIndex;
        continue;
      }

      const key = this.normalizarKeyDesempateManual(params.label, bloco.map((item) => item.equipeId));
      const manualOrder = params.manualTieBreaks?.[key];
      const idsEsperados = new Set(bloco.map((item) => item.equipeId));
      const manualValido =
        Array.isArray(manualOrder) &&
        manualOrder.length === bloco.length &&
        manualOrder.every((id) => idsEsperados.has(id)) &&
        new Set(manualOrder).size === bloco.length;

      if (!manualValido) {
        unresolved.push({
          key,
          label: params.label,
          rankGrupo: bloco[0]?.rankGrupo ?? 0,
          items: bloco.map((item) => ({
            equipeId: item.equipeId,
            equipeNome: item.equipeNome || item.equipeId,
            grupoId: item.grupoId,
            grupoNome: item.grupoNome || item.grupoId,
            rankGrupo: item.rankGrupo,
            pontos: item.pontos,
            saldoGames: item.saldoGames,
            gamesPro: item.gamesPro,
            setsPro: item.setsPro,
            vitorias: item.vitorias,
          })),
        });
        ordered.push(...bloco);
        index = nextIndex;
        continue;
      }

      const blocoMap = new Map(bloco.map((item) => [item.equipeId, item]));
      ordered.push(...manualOrder.map((id) => blocoMap.get(id)).filter((item): item is QualifiedSeed => Boolean(item)));
      index = nextIndex;
    }

    return { ordered, unresolved };
  }

  private resolverOrdenacaoManual(params: {
    qualificados: QualifiedSeed[];
    superCampeonato: boolean;
    manualTieBreaks?: Record<string, string[]>;
  }) {
    const qualificadosPorRank = new Map<number, QualifiedSeed[]>();
    for (const item of params.qualificados) {
      const atuais = qualificadosPorRank.get(item.rankGrupo) ?? [];
      atuais.push(item);
      qualificadosPorRank.set(item.rankGrupo, atuais);
    }

    const orderedByRank = new Map<number, QualifiedSeed[]>();
    const unresolved: ManualTieBreakGroup[] = [];

    for (const [rankGrupo, items] of qualificadosPorRank.entries()) {
      const label = `Ordem manual dos ${this.labelRankGrupo(rankGrupo)} empatados`;
      const result = this.ordenarCandidatosComDesempateManual({
        items,
        label,
        superCampeonato: params.superCampeonato,
        manualTieBreaks: params.manualTieBreaks,
      });
      orderedByRank.set(rankGrupo, result.ordered);
      unresolved.push(...result.unresolved);
    }

    if (unresolved.length > 0) {
      throw new ManualTieBreakRequiredError(unresolved);
    }

    const orderIndex = new Map<string, number>();
    for (const items of orderedByRank.values()) {
      items.forEach((item, index) => {
        orderIndex.set(item.equipeId, index);
      });
    }

    const orderedSeeds = [...params.qualificados].sort((a, b) => {
      const cmp = this.compararQualificadosPorCampanha(a, b, params.superCampeonato);
      if (cmp !== 0) return cmp;
      if (a.rankGrupo !== b.rankGrupo) return a.rankGrupo - b.rankGrupo;
      const orderCmp = (orderIndex.get(a.equipeId) ?? 0) - (orderIndex.get(b.equipeId) ?? 0);
      if (orderCmp !== 0) return orderCmp;
      return a.equipeId.localeCompare(b.equipeId);
    });

    return { orderedByRank, orderedSeeds };
  }

  private async isSuperCampeonato(params: { categoriaId: string }) {
    const rows = await db
      .select({ superCampeonato: torneios.superCampeonato })
      .from(categorias)
      .innerJoin(torneios, eq(categorias.torneioId, torneios.id))
      .where(eq(categorias.id, params.categoriaId))
      .limit(1);
    return rows[0]?.superCampeonato ?? false;
  }

  private fasesPosteriores(apos: Fase): Fase[] {
    if (apos === "OITAVAS") return ["QUARTAS", "SEMI", "FINAL", "TERCEIRO_LUGAR"];
    if (apos === "QUARTAS") return ["SEMI", "FINAL", "TERCEIRO_LUGAR"];
    if (apos === "SEMI") return ["FINAL", "TERCEIRO_LUGAR"];
    return [];
  }

  private async obterConfrontosDecisivosSemi(params: { torneioId: string; categoriaId: string }) {
    const config = await categoriaConfigService.obterOuDefault(params.categoriaId);
    const disputaTerceiroLugar = config.fase2?.disputaTerceiroLugar === true;

    const jogos = await db
      .select({
        id: partidas.id,
        status: partidas.status,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        vencedorId: partidas.vencedorId,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "SEMI")));

    const finalizados = jogos
      .filter((jogo) => (jogo.status === "FINALIZADA" || jogo.status === "WO") && jogo.vencedorId)
      .sort((a, b) => a.id.localeCompare(b.id));

    if (jogos.length === 0 || finalizados.length !== jogos.length) {
      return {
        pronto: false,
        disputaTerceiroLugar,
        final: null as { a: string; b: string } | null,
        terceiroLugar: null as { a: string; b: string } | null,
      };
    }

    const vencedores = finalizados.map((jogo) => jogo.vencedorId!).filter(Boolean);
    const perdedores = finalizados
      .map((jogo) => (jogo.vencedorId === jogo.equipeAId ? jogo.equipeBId : jogo.equipeAId))
      .filter(Boolean) as string[];

    if (vencedores.length !== 2 || perdedores.length !== 2) {
      throw new Error("Não foi possível identificar os classificados da semifinal.");
    }

    return {
      pronto: true,
      disputaTerceiroLugar,
      final: { a: vencedores[0], b: vencedores[1] },
      terceiroLugar: disputaTerceiroLugar ? { a: perdedores[0], b: perdedores[1] } : null,
    };
  }

  private async sincronizarPartidaDecisiva(params: {
    torneioId: string;
    categoriaId: string;
    fase: "FINAL" | "TERCEIRO_LUGAR";
    confronto: { a: string; b: string } | null;
  }) {
    const existentes = await db
      .select({
        id: partidas.id,
        fotoUrl: partidas.fotoUrl,
        arenaId: partidas.arenaId,
        quadra: partidas.quadra,
        dataHorario: partidas.dataHorario,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, params.fase)));

    if (!params.confronto) {
      if (existentes.length === 0) return { criou: 0, atualizou: 0, removeu: 0 };
      await this.garantirSemResultados({ torneioId: params.torneioId, categoriaId: params.categoriaId, fase: params.fase });
      const urls = existentes.map((row) => row.fotoUrl).filter((value): value is string => Boolean(value?.trim()));
      await db
        .delete(partidas)
        .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, params.fase)));
      await Promise.all(urls.map((url) => excluirCardPartidaDoGcs(url)));
      return { criou: 0, atualizou: 0, removeu: existentes.length };
    }

    if (existentes.length > 1) {
      await this.garantirSemResultados({ torneioId: params.torneioId, categoriaId: params.categoriaId, fase: params.fase });
      const urls = existentes.map((row) => row.fotoUrl).filter((value): value is string => Boolean(value?.trim()));
      await db
        .delete(partidas)
        .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, params.fase)));
      await Promise.all(urls.map((url) => excluirCardPartidaDoGcs(url)));
      await db.insert(partidas).values({
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        grupoId: null,
        equipeAId: params.confronto.a,
        equipeBId: params.confronto.b,
        fase: params.fase,
        status: "AGENDADA",
        placarA: 0,
        placarB: 0,
        atualizadoEm: new Date(),
      });
      return { criou: 1, atualizou: 0, removeu: existentes.length };
    }

    const atual = existentes[0];
    if (!atual) {
      await db.insert(partidas).values({
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        grupoId: null,
        equipeAId: params.confronto.a,
        equipeBId: params.confronto.b,
        fase: params.fase,
        status: "AGENDADA",
        placarA: 0,
        placarB: 0,
        atualizadoEm: new Date(),
      });
      return { criou: 1, atualizou: 0, removeu: 0 };
    }

    const deveInvalidarCard = deveInvalidarCardPartida(atual, {
      dataHorario: atual.dataHorario,
      arenaId: atual.arenaId,
      quadra: atual.quadra,
      equipeAId: params.confronto.a,
      equipeBId: params.confronto.b,
    });

    const confrontoMudou = atual.equipeAId !== params.confronto.a || atual.equipeBId !== params.confronto.b;
    if (!confrontoMudou) {
      return { criou: 0, atualizou: 0, removeu: 0 };
    }

    await this.garantirSemResultados({ torneioId: params.torneioId, categoriaId: params.categoriaId, fase: params.fase });
    await db
      .update(partidas)
      .set({
        equipeAId: params.confronto.a,
        equipeBId: params.confronto.b,
        placarA: 0,
        placarB: 0,
        vencedorId: null,
        detalhesPlacar: null as any,
        status: "AGENDADA",
        finalizadoEm: null,
        ...(deveInvalidarCard ? { fotoUrl: null } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, atual.id));

    if (deveInvalidarCard) {
      await excluirCardPartidaDoGcs(atual.fotoUrl);
    }

    return { criou: 0, atualizou: 1, removeu: 0 };
  }

  private async sincronizarFasesDecisivasDaSemi(params: { torneioId: string; categoriaId: string }) {
    const confrontos = await this.obterConfrontosDecisivosSemi(params);
    if (!confrontos.pronto) {
      return { faseCriada: null as FaseProgressiva | null, faseAtualizada: null as FaseProgressiva | null, partidasCriadas: 0, partidasAtualizadas: 0 };
    }

    const [finalResultado, terceiroResultado] = await Promise.all([
      this.sincronizarPartidaDecisiva({
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        fase: "FINAL",
        confronto: confrontos.final,
      }),
      this.sincronizarPartidaDecisiva({
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        fase: "TERCEIRO_LUGAR",
        confronto: confrontos.terceiroLugar,
      }),
    ]);

    const partidasCriadas = finalResultado.criou + terceiroResultado.criou;
    const partidasAtualizadas =
      finalResultado.atualizou + terceiroResultado.atualizou + finalResultado.removeu + terceiroResultado.removeu;

    if (partidasCriadas > 0) {
      return {
        faseCriada: "FINAL" as FaseProgressiva,
        faseAtualizada: partidasAtualizadas > 0 ? ("FINAL" as FaseProgressiva) : null,
        partidasCriadas,
        partidasAtualizadas,
      };
    }

    if (partidasAtualizadas > 0) {
      return {
        faseCriada: null as FaseProgressiva | null,
        faseAtualizada: "FINAL" as FaseProgressiva,
        partidasCriadas: 0,
        partidasAtualizadas,
      };
    }

    return { faseCriada: null as FaseProgressiva | null, faseAtualizada: null as FaseProgressiva | null, partidasCriadas: 0, partidasAtualizadas: 0 };
  }

  private async calcularSeeds(params: { categoriaId: string; manualTieBreaks?: Record<string, string[]> }) {
    const config = await categoriaConfigService.obterOuDefault(params.categoriaId);
    if (config.formato !== "GRUPOS") throw new Error("Formato da categoria não é GRUPOS");
    if (config.fase2?.habilitada === false) throw new Error("Fase 2 desabilitada");
    const superCampeonato = await this.isSuperCampeonato({ categoriaId: params.categoriaId });
    const porGrupo = config.classificacao?.porGrupo ?? 2;
    const melhoresTerceiros = config.classificacao?.melhoresTerceiros ?? 0;

    const grupos = await classificacaoCategoriaService.obterClassificacao(params.categoriaId);
    if (grupos.length === 0) throw new Error("Nenhum grupo encontrado");

    if (superCampeonato) {
      const g0 = grupos[0];
      const qtdClassificados = config.mataMata?.quantidadeClassificados ?? 6;
      const topN = (g0?.equipes ?? []).slice(0, qtdClassificados);
      const qualificados = topN.map((e, idx) => ({
        equipeId: e.equipeId,
        grupoId: g0.grupoId,
        rankGrupo: idx + 1,
        pontos: e.pontos ?? 0,
        saldoGames: e.saldoGames ?? 0,
        gamesPro: e.gamesPro ?? 0,
        setsPro: (e as any).setsPro ?? 0,
        vitorias: e.jogosVencidos ?? 0,
      }));
      return { config, grupos, qualificados, superCampeonato, seeds: qualificados.map((s) => s.equipeId) };
    }

    const qualificados: {
      equipeId: string;
      grupoId: string;
      grupoNome?: string;
      equipeNome?: string;
      rankGrupo: number;
      pontos: number;
      saldoGames: number;
      gamesPro: number;
      setsPro: number;
      vitorias: number;
    }[] = [];

    for (const g of grupos) {
      const top = g.equipes.slice(0, porGrupo);
      for (let i = 0; i < top.length; i++) {
        const e = top[i];
        qualificados.push({
          equipeId: e.equipeId,
          grupoId: g.grupoId,
          grupoNome: g.grupoNome,
          equipeNome: e.equipeNome,
          rankGrupo: i + 1,
          pontos: e.pontos ?? 0,
          saldoGames: e.saldoGames ?? 0,
          gamesPro: e.gamesPro ?? 0,
          setsPro: (e as any).setsPro ?? 0,
          vitorias: e.jogosVencidos ?? 0,
        });
      }
    }

    if (melhoresTerceiros > 0) {
      const restantes: any[] = [];
      for (const g of grupos) {
        const rest = g.equipes.slice(porGrupo);
        for (const e of rest) {
          restantes.push({
            equipeId: e.equipeId,
            grupoId: g.grupoId,
            grupoNome: g.grupoNome,
            equipeNome: e.equipeNome,
            rankGrupo: 999,
            pontos: e.pontos ?? 0,
            saldoGames: e.saldoGames ?? 0,
            gamesPro: e.gamesPro ?? 0,
            setsPro: (e as any).setsPro ?? 0,
            vitorias: e.jogosVencidos ?? 0,
          });
        }
      }
      const terceirosOrdenados = this.ordenarCandidatosComDesempateManual({
        items: restantes,
        label: "Ordem manual dos melhores terceiros empatados",
        superCampeonato,
        manualTieBreaks: params.manualTieBreaks,
      });
      if (terceirosOrdenados.unresolved.length > 0) {
        throw new ManualTieBreakRequiredError(terceirosOrdenados.unresolved);
      }
      for (const e of terceirosOrdenados.ordered.slice(0, melhoresTerceiros)) qualificados.push(e);
    }

    const resolvido = this.resolverOrdenacaoManual({
      qualificados,
      superCampeonato,
      manualTieBreaks: params.manualTieBreaks,
    });

    return {
      config,
      grupos,
      qualificados,
      superCampeonato,
      seeds: resolvido.orderedSeeds.map((s) => s.equipeId),
      orderedByRank: resolvido.orderedByRank,
    };
  }

  private compararQualificados(a: QualifiedSeed, b: QualifiedSeed, superCampeonato: boolean) {
    if (superCampeonato) {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      if (b.setsPro !== a.setsPro) return b.setsPro - a.setsPro;
      if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
    } else {
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
      if (b.gamesPro !== a.gamesPro) return b.gamesPro - a.gamesPro;
    }
    return a.equipeId.localeCompare(b.equipeId);
  }

  private compararQualificadosPorCampanha(a: QualifiedSeed, b: QualifiedSeed, superCampeonato: boolean) {
    if (superCampeonato) {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      if (b.setsPro !== a.setsPro) return b.setsPro - a.setsPro;
      if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
      return 0;
    }

    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
    if (b.gamesPro !== a.gamesPro) return b.gamesPro - a.gamesPro;
    return 0;
  }

  private montarEstruturaGrupos6MelhoresPrimeirosBye(params: {
    qualificados: QualifiedSeed[];
    superCampeonato: boolean;
    primeirosOrdenados?: QualifiedSeed[];
    segundosOrdenados?: QualifiedSeed[];
  }) {
    const primeiros =
      params.primeirosOrdenados && params.primeirosOrdenados.length > 0
        ? params.primeirosOrdenados
        : params.qualificados
            .filter((item) => item.rankGrupo === 1)
            .sort((a, b) => this.compararQualificados(a, b, params.superCampeonato));
    const segundos =
      params.segundosOrdenados && params.segundosOrdenados.length > 0
        ? params.segundosOrdenados
        : params.qualificados
            .filter((item) => item.rankGrupo === 2)
            .sort((a, b) => this.compararQualificados(a, b, params.superCampeonato));

    if (primeiros.length < 3 || segundos.length < 3) {
      throw new Error("Esta estrutura exige 3 grupos com 2 classificados por grupo, para gerar 3 primeiros e 3 segundos colocados.");
    }

    const byeSemifinal = [primeiros[0].equipeId, primeiros[1].equipeId];
    const quartas = [
      { a: primeiros[2].equipeId, b: segundos[0].equipeId },
      { a: segundos[1].equipeId, b: segundos[2].equipeId },
    ];
    const ordemSeeds = [
      primeiros[0].equipeId,
      primeiros[1].equipeId,
      primeiros[2].equipeId,
      segundos[0].equipeId,
      segundos[1].equipeId,
      segundos[2].equipeId,
    ];

    return { byeSemifinal, quartas, ordemSeeds };
  }

  private async calcularPairingsProximaFase(params: { torneioId: string; categoriaId: string; faseAtual: Fase }) {
    const faseProxima = proximaFase(params.faseAtual);
    if (!faseProxima) return { faseProxima: null as any, pairings: [] as { a: string; b: string }[] };
    if (params.faseAtual === "TERCEIRO_LUGAR") {
      return { faseProxima: null as any, pairings: [] as { a: string; b: string }[] };
    }

    const jogos = await db
      .select({ id: partidas.id, status: partidas.status, vencedorId: partidas.vencedorId })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, params.faseAtual)));

    const finalizados = jogos.filter((j) => (j.status === "FINALIZADA" || j.status === "WO") && j.vencedorId);
    if (finalizados.length !== jogos.length) return { faseProxima, pairings: [] as { a: string; b: string }[] };

    const winners = finalizados
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((j) => j.vencedorId!)
      .filter(Boolean);

    const pairings: { a: string; b: string }[] = [];
    const { seeds, qualificados, superCampeonato, config } = await this.calcularSeeds({ categoriaId: params.categoriaId });
    const estrutura = config.mataMata?.estrutura ?? "SUPER_CAMPEONATO_6";

    if (superCampeonato) {
      const rank = new Map<string, number>();
      for (let i = 0; i < seeds.length; i++) rank.set(seeds[i], i + 1);

      if (estrutura === "SUPER_CAMPEONATO_6") {
        if (faseProxima === "SEMI") {
          // Caso antigo: 1º e 2º passam direto
          if (params.faseAtual === "QUARTAS" && winners.length === 2 && seeds.length === 6) {
            const semifinalistas = [seeds[0], seeds[1], winners[0], winners[1]].filter(Boolean);
            if (semifinalistas.length !== 4) {
              throw new Error("Não foi possível montar a semifinal do Super Campeonato.");
            }
            // Ordena os 4 semifinalistas de acordo com seu rank da 1ª fase
            semifinalistas.sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
            // 1º vs 4º, 2º vs 3º
            pairings.push({ a: semifinalistas[0], b: semifinalistas[3] });
            pairings.push({ a: semifinalistas[1], b: semifinalistas[2] });
            return { faseProxima, pairings };
          }
        }
      } else {
        // Estrutura PADRAO: re-seeding em TODAS as fases + byes automáticos
        // 1. Calcula o tamanho original da chave (próxima potência de 2)
        const total = seeds.length;
        const tamanhoChaveOriginal = getNextPowerOfTwo(total);
        
        // 2. Calcula quantas equipes deveriam estar na fase atual (tamanho da chave / 2^fase)
        let tamanhoFaseAtual = tamanhoChaveOriginal;
        const idxFaseAtual = ordemFases.indexOf(params.faseAtual);
        for (let i = 0; i < idxFaseAtual; i++) {
          tamanhoFaseAtual /= 2;
        }
        
        // 3. Calcula quantos byes havia na fase anterior (equipes que passaram direto)
        const idxFaseAnterior = idxFaseAtual - 1;
        let tamanhoFaseAnterior = tamanhoChaveOriginal;
        for (let i = 0; i < idxFaseAnterior; i++) {
          tamanhoFaseAnterior /= 2;
        }
        const byesFaseAnterior = tamanhoFaseAnterior - jogos.length;

        // 4. Identifica as equipes que passaram por bye na fase anterior (top seeds)
        const byesEquipes: string[] = [];
        for (let i = 0; i < byesFaseAnterior; i++) {
          byesEquipes.push(seeds[i]);
        }

        // 5. Junta byes + vencedores, formando a lista completa da fase atual
        const equipesFaseAtual = [...byesEquipes, ...winners].filter(Boolean);
        
        // 6. RE-SEEDING: ordena todas as equipes pelo seu rank ORIGINAL da fase de grupos
        equipesFaseAtual.sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));

        // 7. Monta cruzamentos: melhor vs pior, segundo melhor vs segundo pior, etc.
        for (let i = 0; i < equipesFaseAtual.length / 2; i++) {
          pairings.push({ a: equipesFaseAtual[i], b: equipesFaseAtual[equipesFaseAtual.length - 1 - i] });
        }
        return { faseProxima, pairings };
      }
    }

    // Caso não seja Super Campeonato, mantemos a logica original
    if (params.faseAtual === "QUARTAS" && winners.length === 2) {
      if (estrutura === "GRUPOS_6_MELHORES_PRIMEIROS_BYE" && seeds.length === 6) {
        const estruturaByes = this.montarEstruturaGrupos6MelhoresPrimeirosBye({ qualificados, superCampeonato });
        const rank = new Map<string, number>();
        for (let i = 0; i < estruturaByes.ordemSeeds.length; i++) {
          rank.set(estruturaByes.ordemSeeds[i], i + 1);
        }

        const jogosFull = await db
          .select({ id: partidas.id, equipeAId: partidas.equipeAId, equipeBId: partidas.equipeBId, vencedorId: partidas.vencedorId })
          .from(partidas)
          .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "QUARTAS")));
        const quartasValidas = jogosFull
          .filter((m) => m.vencedorId && m.equipeAId && m.equipeBId)
          .map((m) => ({
            ...m,
            melhorSeed: Math.min(rank.get(m.equipeAId!) ?? 999, rank.get(m.equipeBId!) ?? 999),
          }))
          .sort((a, b) => a.melhorSeed - b.melhorSeed || a.id.localeCompare(b.id));
        if (quartasValidas.length !== 2) return { faseProxima, pairings: [] as { a: string; b: string }[] };

        const jogoComPiorPrimeiro = quartasValidas[0];
        const jogoEntreSegundos = quartasValidas[1];
        pairings.push({ a: estruturaByes.byeSemifinal[0], b: jogoEntreSegundos.vencedorId! });
        pairings.push({ a: estruturaByes.byeSemifinal[1], b: jogoComPiorPrimeiro.vencedorId! });
      } else if (seeds.length === 6) {
        const s1 = seeds[0];
        const s2 = seeds[1];
        const rank = new Map<string, number>();
        for (let i = 0; i < seeds.length; i++) {
          rank.set(seeds[i], i + 1);
        }

        const jogosFull = await db
          .select({ id: partidas.id, equipeAId: partidas.equipeAId, equipeBId: partidas.equipeBId, vencedorId: partidas.vencedorId })
          .from(partidas)
          .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "QUARTAS")));
        const quartasValidas = jogosFull
          .filter((m) => m.vencedorId && m.equipeAId && m.equipeBId)
          .map((m) => ({
            ...m,
            melhorSeed: Math.min(rank.get(m.equipeAId!) ?? 999, rank.get(m.equipeBId!) ?? 999),
          }))
          .sort((a, b) => a.melhorSeed - b.melhorSeed || a.id.localeCompare(b.id));
        if (quartasValidas.length !== 2) return { faseProxima, pairings: [] as { a: string; b: string }[] };

        const ladoMaisForte = quartasValidas[0];
        const outroLado = quartasValidas[1];
        pairings.push({ a: s1, b: outroLado.vencedorId! });
        pairings.push({ a: s2, b: ladoMaisForte.vencedorId! });
      } else {
        if (winners.length % 2 !== 0) throw new Error("Não foi possível gerar a próxima fase: quantidade de vencedores inválida.");
        pairings.push({ a: winners[0], b: winners[1] });
      }
    } else {
      if (winners.length % 2 !== 0) {
        throw new Error("Não foi possível gerar a próxima fase: quantidade de vencedores inválida.");
      }
      for (let i = 0; i < winners.length; i += 2) {
        pairings.push({ a: winners[i], b: winners[i + 1] });
      }
    }

    return { faseProxima, pairings };
  }

  private async garantirSemResultados(params: { torneioId: string; categoriaId: string; fase: Fase }) {
    const rows = await db
      .select({
        id: partidas.id,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, params.fase)));

    const started = rows.some((p) => {
      if (p.status !== "AGENDADA") return true;
      if (p.vencedorId) return true;
      if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
      if (p.detalhesPlacar && (p.detalhesPlacar as any[]).length > 0) return true;
      return false;
    });
    if (started) {
      throw new Error(`Não é possível ajustar a chave: a fase ${params.fase} já tem placares lançados.`);
    }
  }

  private async limparFasesPosteriores(params: { torneioId: string; categoriaId: string; apos: Fase }) {
    const fases = this.fasesPosteriores(params.apos);
    for (const fase of fases) {
      const existentes = await db
        .select({ id: partidas.id, fotoUrl: partidas.fotoUrl })
        .from(partidas)
        .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, fase)));
      if (existentes.length === 0) continue;
      await this.garantirSemResultados({ torneioId: params.torneioId, categoriaId: params.categoriaId, fase });

      const idsParaApagar = existentes.map((row) => row.id);
      const urlsParaExcluir = existentes.map((row) => row.fotoUrl).filter((value): value is string => Boolean(value?.trim()));

      await db.transaction(async (tx) => {
        if (idsParaApagar.length > 0) {
          await tx.delete(placarSubmissoes).where(inArray(placarSubmissoes.partidaId, idsParaApagar));
        }
        await tx.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, fase)));
      });

      await Promise.all(urlsParaExcluir.map((url) => excluirCardPartidaDoGcs(url)));
    }
  }

  async resetarChaveDepoisDeFaseSePossivel(params: { torneioId: string; categoriaId: string; faseAtual: Fase }) {
    await this.limparFasesPosteriores({ torneioId: params.torneioId, categoriaId: params.categoriaId, apos: params.faseAtual });
    return { ok: true };
  }

  async montarFaseManual(params: {
    torneioId: string;
    categoriaId: string;
    fase: Fase;
    confrontos: Array<{ equipeAId: string; equipeBId: string }>;
    limparPosteriores?: boolean;
  }) {
    const fase = params.fase;
    if (fase === "TERCEIRO_LUGAR" || !ordemFases.includes(fase)) {
      throw new Error("Fase inválida para montagem manual");
    }

    const confrontos = Array.isArray(params.confrontos) ? params.confrontos : [];
    if (confrontos.length === 0) {
      throw new Error("Informe ao menos um confronto para montar a fase");
    }

    const equipesUsadas = new Set<string>();
    for (const c of confrontos) {
      const a = String(c?.equipeAId || "").trim();
      const b = String(c?.equipeBId || "").trim();
      if (!a || !b) throw new Error("Todos os confrontos precisam ter Dupla A e Dupla B");
      if (a === b) throw new Error("Dupla A e Dupla B precisam ser diferentes no confronto");
      if (equipesUsadas.has(a) || equipesUsadas.has(b)) {
        throw new Error("Uma mesma dupla não pode aparecer em mais de um confronto na mesma fase");
      }
      equipesUsadas.add(a);
      equipesUsadas.add(b);
    }

    const equipesPermitidasRows = await db
      .select({ id: equipes.id })
      .from(inscricoes)
      .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
      .where(and(eq(inscricoes.torneioId, params.torneioId), eq(inscricoes.categoriaId, params.categoriaId), eq(inscricoes.status, "APROVADA")));

    const permitidas = new Set(equipesPermitidasRows.map((r) => r.id));
    for (const id of equipesUsadas) {
      if (!permitidas.has(id)) {
        throw new Error("Uma das duplas selecionadas não está aprovada nesta categoria");
      }
    }

    const fasesAlvo = params.limparPosteriores === false ? [fase] : [fase, ...this.fasesPosteriores(fase)];

    const existentes = await db
      .select({
        id: partidas.id,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
        fotoUrl: partidas.fotoUrl,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), inArray(partidas.fase, fasesAlvo as any)));

    if (existentes.some(partidaIniciada)) {
      throw new Error("Não é possível montar a fase: existem jogos iniciados ou com placar lançado na fase escolhida (ou posteriores)");
    }

    const idsParaApagar = existentes.map((r) => r.id);
    const urlsParaExcluir = existentes.map((r) => r.fotoUrl).filter((value): value is string => Boolean(value?.trim()));

    await db.transaction(async (tx) => {
      if (idsParaApagar.length > 0) {
        await tx.delete(placarSubmissoes).where(inArray(placarSubmissoes.partidaId, idsParaApagar));
        await tx
          .delete(partidas)
          .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), inArray(partidas.fase, fasesAlvo as any)));
      }

      for (const c of confrontos) {
        await tx.insert(partidas).values({
          torneioId: params.torneioId,
          categoriaId: params.categoriaId,
          rodadaId: null,
          grupoId: null,
          arenaId: null,
          equipeAId: c.equipeAId,
          equipeBId: c.equipeBId,
          fase,
          status: "AGENDADA",
          placarA: 0,
          placarB: 0,
          detalhesPlacar: null as any,
          vencedorId: null,
          atualizadoEm: new Date(),
        });
      }
    });

    await Promise.all(urlsParaExcluir.map((url) => excluirCardPartidaDoGcs(url)));

    return { ok: true, fase, partidasCriadas: confrontos.length, fasesAfetadas: fasesAlvo };
  }

  async substituirEquipeNaFase(params: {
    torneioId: string;
    categoriaId: string;
    partidaId: string;
    equipeOrigemId: string;
    equipeDestinoId: string;
  }) {
    if (params.equipeOrigemId === params.equipeDestinoId) {
      throw new Error("Escolha uma dupla diferente para substituir");
    }

    const partidaRows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
      })
      .from(partidas)
      .where(and(eq(partidas.id, params.partidaId), eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId)))
      .limit(1);
    const partida = partidaRows[0];
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.fase === "GRUPOS") throw new Error("Substituição em lote é somente no mata-mata");

    const faseAtual = partida.fase as Fase;
    await this.garantirSemResultados({ torneioId: params.torneioId, categoriaId: params.categoriaId, fase: faseAtual });
    await this.limparFasesPosteriores({ torneioId: params.torneioId, categoriaId: params.categoriaId, apos: faseAtual });

    const faseRows = await db
      .select({
        id: partidas.id,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        fotoUrl: partidas.fotoUrl,
        arenaId: partidas.arenaId,
        quadra: partidas.quadra,
        dataHorario: partidas.dataHorario,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, faseAtual)));

    const afetadas = faseRows.filter((row) => row.equipeAId === params.equipeOrigemId || row.equipeBId === params.equipeOrigemId);
    if (afetadas.length === 0) {
      throw new Error("A dupla escolhida não aparece nesta fase da chave");
    }

    await db.transaction(async (tx) => {
      for (const row of afetadas) {
        const proximoEquipeAId = row.equipeAId === params.equipeOrigemId ? params.equipeDestinoId : row.equipeAId;
        const proximoEquipeBId = row.equipeBId === params.equipeOrigemId ? params.equipeDestinoId : row.equipeBId;
        const deveInvalidarCard = deveInvalidarCardPartida(row, {
          dataHorario: row.dataHorario,
          arenaId: row.arenaId,
          quadra: row.quadra,
          equipeAId: proximoEquipeAId,
          equipeBId: proximoEquipeBId,
        });
        await tx
          .update(partidas)
          .set({
            equipeAId: proximoEquipeAId,
            equipeBId: proximoEquipeBId,
            vencedorId: null,
            placarA: 0,
            placarB: 0,
            detalhesPlacar: null as any,
            status: "AGENDADA",
            finalizadoEm: null,
            ...(deveInvalidarCard ? { fotoUrl: null } : {}),
            atualizadoEm: new Date(),
          })
          .where(eq(partidas.id, row.id));
      }
    });

    await Promise.all(afetadas.map((row) => excluirCardPartidaDoGcs(row.fotoUrl)));

    return { fase: faseAtual, partidasAtualizadas: afetadas.length };
  }

  async cancelarPlacarSePossivel(params: { torneioId: string; categoriaId: string; partidaId: string }) {
    const partidaRows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(and(eq(partidas.id, params.partidaId), eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId)))
      .limit(1);
    const partida = partidaRows[0];
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.fase === "GRUPOS") throw new Error("Cancelamento de placar é somente no mata-mata");

    const faseAtual = partida.fase as Fase;
    const faseProxima = proximaFase(faseAtual);
    const teams = [partida.equipeAId, partida.equipeBId];
    let jogosPosteriores: Array<{
      id: string;
      fase: Fase | "GRUPOS";
      status: string | null;
      equipeAId: string | null;
      equipeBId: string | null;
      vencedorId: string | null;
      placarA: number | null;
      placarB: number | null;
      detalhesPlacar: unknown;
      fotoUrl: string | null;
    }> = [];

    if (faseProxima) {
      const posteriores = this.fasesPosteriores(faseAtual);
      jogosPosteriores = await db
        .select({
          id: partidas.id,
          fase: partidas.fase,
          status: partidas.status,
          equipeAId: partidas.equipeAId,
          equipeBId: partidas.equipeBId,
          vencedorId: partidas.vencedorId,
          placarA: partidas.placarA,
          placarB: partidas.placarB,
          detalhesPlacar: partidas.detalhesPlacar,
          fotoUrl: partidas.fotoUrl,
        })
        .from(partidas)
        .where(
          and(
            eq(partidas.torneioId, params.torneioId),
            eq(partidas.categoriaId, params.categoriaId),
            inArray(partidas.fase, posteriores as any),
            or(inArray(partidas.equipeAId, teams), inArray(partidas.equipeBId, teams))
          )
        );

      const algumJogoIniciado = jogosPosteriores.some((j) => partidaIniciada(j));
      if (algumJogoIniciado) {
        throw new Error("Não é possível cancelar: já houve jogo na fase seguinte para uma das duplas");
      }
    }

    const jogosPosterioresIds = faseProxima
      ? jogosPosteriores.map((jogo) => jogo.id)
      : [];
    const jogosPosterioresUrls = faseProxima
      ? jogosPosteriores.map((jogo) => jogo.fotoUrl).filter((value): value is string => Boolean(value?.trim()))
      : [];

    const updated = await db.transaction(async (tx) => {
      if (jogosPosterioresIds.length > 0) {
        await tx.delete(placarSubmissoes).where(inArray(placarSubmissoes.partidaId, jogosPosterioresIds));
        await tx.delete(partidas).where(inArray(partidas.id, jogosPosterioresIds));
      }

      const [u] = await tx
        .update(partidas)
        .set({
          vencedorId: null,
          placarA: 0,
          placarB: 0,
          detalhesPlacar: null as any,
          status: "AGENDADA",
          finalizadoEm: null,
          atualizadoEm: new Date(),
        })
        .where(eq(partidas.id, params.partidaId))
        .returning();
      return u;
    });

    await Promise.all(jogosPosterioresUrls.map((url) => excluirCardPartidaDoGcs(url)));

    return updated;
  }

  async gerarPrimeiraFase(params: { torneioId: string; categoriaId: string; manualTieBreaks?: Record<string, string[]> }) {
    const { config, grupos, qualificados, seeds: seedIds, superCampeonato, orderedByRank } = await this.calcularSeeds({
      categoriaId: params.categoriaId,
      manualTieBreaks: params.manualTieBreaks,
    });
    const total = qualificados.length;
    
    // Regra específica para Super Campeonato
    if (superCampeonato) {
      await db.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), not(eq(partidas.fase, "GRUPOS"))));

      const estrutura = config.mataMata?.estrutura ?? "SUPER_CAMPEONATO_6";

      if (estrutura === "SUPER_CAMPEONATO_6") {
        if (total !== 6) {
          throw new Error("Super Campeonato precisa de pelo menos 6 equipes no Grupo Único para gerar o mata-mata (Quartas: 3ºx6º e 4ºx5º; 1º e 2º bye).");
        }

        const s3 = seedIds[2];
        const s4 = seedIds[3];
        const s5 = seedIds[4];
        const s6 = seedIds[5];

        const pairings = [
          { a: s3, b: s6 }, // Jogo 1 Quartas
          { a: s4, b: s5 }, // Jogo 2 Quartas
        ];

        let partidasCriadas = 0;
        for (const p of pairings) {
          await db.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            grupoId: null,
            equipeAId: p.a,
            equipeBId: p.b,
            fase: "QUARTAS",
            status: "AGENDADA",
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
          partidasCriadas += 1;
        }
        return { fase: "QUARTAS", partidasCriadas, qualificados: total };
      } else {
        // Estrutura PADRAO (chave com byes)
        const tamanhoChave = getNextPowerOfTwo(total);
        // Calcula a primeira fase da chave
        let primeiraFase: Fase;
        if (tamanhoChave === 2) primeiraFase = "FINAL";
        else if (tamanhoChave === 4) primeiraFase = "SEMI";
        else if (tamanhoChave === 8) primeiraFase = "QUARTAS";
        else primeiraFase = "OITAVAS";

        const pairings: { a: string; b: string }[] = [];
        
        // Monta os cruzamentos (standard bracket: 1 vs last, 2 vs second last, etc.)
        for (let i = 0; i < tamanhoChave / 2; i++) {
          const idx1 = i;
          const idx2 = tamanhoChave - 1 - i;
          
          // Verifica se ambas as posições têm equipes (não são byes)
          if (idx1 < total && idx2 < total) {
            pairings.push({ a: seedIds[idx1], b: seedIds[idx2] });
          }
          // Se uma das posições for um bye (>= total), não cria jogo - a equipe passa direto
        }

        let partidasCriadas = 0;
        for (const p of pairings) {
          await db.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            grupoId: null,
            equipeAId: p.a,
            equipeBId: p.b,
            fase: primeiraFase,
            status: "AGENDADA",
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
          partidasCriadas += 1;
        }
        return { fase: primeiraFase, partidasCriadas, qualificados: total };
      }
    }

    if (grupos.length === 1 && (config.fase2?.temFinal ?? true) === false) {
      return { fase: null as any, partidasCriadas: 0, qualificados: total };
    }

    if (!(isPowerOfTwo(total) || total === 6)) {
      throw new Error("Quantidade de classificados não fecha chave (2/4/6/8/16). Ajuste porGrupo/melhoresTerceiros.");
    }

    await db.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), not(eq(partidas.fase, "GRUPOS"))));

    const fase = faseParaQuantidade(total);

    const pairings: { a: string; b: string }[] = [];
    const gruposOrdenados = [...grupos].sort((a, b) => a.grupoNome.localeCompare(b.grupoNome));

    if (total === 6) {
      if (config.mataMata?.estrutura === "GRUPOS_6_MELHORES_PRIMEIROS_BYE") {
        const estruturaByes = this.montarEstruturaGrupos6MelhoresPrimeirosBye({
          qualificados,
          superCampeonato,
          primeirosOrdenados: orderedByRank.get(1) ?? [],
          segundosOrdenados: orderedByRank.get(2) ?? [],
        });
        pairings.push(...estruturaByes.quartas);
      } else {
        const s3 = seedIds[2];
        const s4 = seedIds[3];
        const s5 = seedIds[4];
        const s6 = seedIds[5];
        if (!seedIds[0] || !seedIds[1] || !s3 || !s4 || !s5 || !s6) {
          throw new Error("Não foi possível montar a chave para 6 classificados.");
        }
        pairings.push({ a: s3, b: s6 });
        pairings.push({ a: s4, b: s5 });
      }
    } else if (config.mataMata?.estrutura === "GRUPOS_8_CRUZAMENTO_PADRAO") {
      if (!(gruposOrdenados.length === 4 && (config.classificacao?.porGrupo ?? 2) >= 2 && total === 8)) {
        throw new Error("A estrutura de 8 classificados com cruzamento padrão exige 4 grupos com 2 classificados por grupo.");
      }
      const g0 = gruposOrdenados[0].equipes;
      const g1 = gruposOrdenados[1].equipes;
      const g2 = gruposOrdenados[2].equipes;
      const g3 = gruposOrdenados[3].equipes;
      pairings.push({ a: g0[0].equipeId, b: g3[1].equipeId });
      pairings.push({ a: g1[0].equipeId, b: g2[1].equipeId });
      pairings.push({ a: g2[0].equipeId, b: g1[1].equipeId });
      pairings.push({ a: g3[0].equipeId, b: g0[1].equipeId });
    } else if (gruposOrdenados.length === 2 && (config.classificacao?.porGrupo ?? 2) >= 2 && total === 4) {
      const ga = gruposOrdenados[0].equipes;
      const gb = gruposOrdenados[1].equipes;
      pairings.push({ a: ga[0].equipeId, b: gb[1].equipeId });
      pairings.push({ a: gb[0].equipeId, b: ga[1].equipeId });
    } else if (gruposOrdenados.length === 2 && (config.classificacao?.porGrupo ?? 2) >= 4 && total === 8) {
      const ga = gruposOrdenados[0].equipes;
      const gb = gruposOrdenados[1].equipes;
      pairings.push({ a: ga[0].equipeId, b: gb[3].equipeId });
      pairings.push({ a: ga[1].equipeId, b: gb[2].equipeId });
      pairings.push({ a: gb[0].equipeId, b: ga[3].equipeId });
      pairings.push({ a: gb[1].equipeId, b: ga[2].equipeId });
    } else if (gruposOrdenados.length === 4 && (config.classificacao?.porGrupo ?? 2) >= 2 && total === 8) {
      const g0 = gruposOrdenados[0].equipes;
      const g1 = gruposOrdenados[1].equipes;
      const g2 = gruposOrdenados[2].equipes;
      const g3 = gruposOrdenados[3].equipes;
      pairings.push({ a: g0[0].equipeId, b: g3[1].equipeId });
      pairings.push({ a: g1[0].equipeId, b: g2[1].equipeId });
      pairings.push({ a: g2[0].equipeId, b: g1[1].equipeId });
      pairings.push({ a: g3[0].equipeId, b: g0[1].equipeId });
    } else if (gruposOrdenados.length === 1 && total === 2) {
      const g0 = gruposOrdenados[0].equipes;
      pairings.push({ a: g0[0].equipeId, b: g0[1].equipeId });
    } else {
      for (let i = 0; i < seedIds.length / 2; i++) {
        pairings.push({ a: seedIds[i], b: seedIds[seedIds.length - 1 - i] });
      }
    }

    let partidasCriadas = 0;
    for (const p of pairings) {
      await db.insert(partidas).values({
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        grupoId: null,
        equipeAId: p.a,
        equipeBId: p.b,
        fase,
        status: "AGENDADA",
        placarA: 0,
        placarB: 0,
        atualizadoEm: new Date(),
      });
      partidasCriadas += 1;
    }

    return { fase, partidasCriadas, qualificados: total };
  }

  async gerarProximaFaseSeCompleta(params: { torneioId: string; categoriaId: string; faseAtual: Fase }) {
    if (params.faseAtual === "SEMI") {
      const r = await this.sincronizarFasesDecisivasDaSemi({ torneioId: params.torneioId, categoriaId: params.categoriaId });
      return { faseCriada: r.faseCriada ?? r.faseAtualizada, partidasCriadas: r.partidasCriadas };
    }

    const faseProxima = proximaFase(params.faseAtual);
    if (!faseProxima) return { faseCriada: null as any, partidasCriadas: 0 };

    const existentes = await db
      .select({ id: partidas.id })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, faseProxima)))
      .limit(1);
    if (existentes.length > 0) return { faseCriada: null as any, partidasCriadas: 0 };

    const calc = await this.calcularPairingsProximaFase(params);
    if (calc.pairings.length === 0) return { faseCriada: null as any, partidasCriadas: 0 };

    let partidasCriadas = 0;
    for (const p of calc.pairings) {
      await db.insert(partidas).values({
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        grupoId: null,
        equipeAId: p.a,
        equipeBId: p.b,
        fase: calc.faseProxima,
        status: "AGENDADA",
        placarA: 0,
        placarB: 0,
        atualizadoEm: new Date(),
      });
      partidasCriadas += 1;
    }

    return { faseCriada: calc.faseProxima, partidasCriadas };
  }

  async sincronizarChaveAposAtualizacaoResultado(params: { torneioId: string; categoriaId: string; faseAtual: Fase }) {
    if (params.faseAtual === "SEMI") {
      return this.sincronizarFasesDecisivasDaSemi({ torneioId: params.torneioId, categoriaId: params.categoriaId });
    }

    const faseProxima = proximaFase(params.faseAtual);
    if (!faseProxima) return { faseCriada: null as any, faseAtualizada: null as any, partidasCriadas: 0, partidasAtualizadas: 0 };

    const existentes = await db
      .select({
        id: partidas.id,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
        fotoUrl: partidas.fotoUrl,
        arenaId: partidas.arenaId,
        quadra: partidas.quadra,
        dataHorario: partidas.dataHorario,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, faseProxima)));

    if (existentes.length === 0) {
      const r = await this.gerarProximaFaseSeCompleta(params);
      return { faseCriada: r.faseCriada, faseAtualizada: null as any, partidasCriadas: r.partidasCriadas, partidasAtualizadas: 0 };
    }

    const calc = await this.calcularPairingsProximaFase(params);
    if (calc.pairings.length === 0) {
      return { faseCriada: null as any, faseAtualizada: null as any, partidasCriadas: 0, partidasAtualizadas: 0 };
    }

    await this.garantirSemResultados({ torneioId: params.torneioId, categoriaId: params.categoriaId, fase: faseProxima });
    await this.limparFasesPosteriores({ torneioId: params.torneioId, categoriaId: params.categoriaId, apos: faseProxima });

    if (existentes.length !== calc.pairings.length) {
      const urlsParaExcluir = existentes.map((row) => row.fotoUrl).filter((value): value is string => Boolean(value?.trim()));
      await db.transaction(async (tx) => {
        await tx
          .delete(partidas)
          .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, faseProxima)));

        for (const p of calc.pairings) {
          await tx.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            grupoId: null,
            equipeAId: p.a,
            equipeBId: p.b,
            fase: faseProxima,
            status: "AGENDADA",
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
        }
      });

      await Promise.all(urlsParaExcluir.map((url) => excluirCardPartidaDoGcs(url)));

      return {
        faseCriada: null as any,
        faseAtualizada: faseProxima,
        partidasCriadas: 0,
        partidasAtualizadas: calc.pairings.length,
      };
    }

    const sorted = existentes.slice().sort((a, b) => a.id.localeCompare(b.id));
    let partidasAtualizadas = 0;
    for (let i = 0; i < sorted.length; i++) {
      const p = calc.pairings[i];
      const atual = sorted[i];
      const deveInvalidarCard = deveInvalidarCardPartida(atual, {
        dataHorario: atual.dataHorario,
        arenaId: atual.arenaId,
        quadra: atual.quadra,
        equipeAId: p.a,
        equipeBId: p.b,
      });
      await db
        .update(partidas)
        .set({
          equipeAId: p.a,
          equipeBId: p.b,
          placarA: 0,
          placarB: 0,
          vencedorId: null,
          detalhesPlacar: null as any,
          status: "AGENDADA",
          finalizadoEm: null,
          ...(deveInvalidarCard ? { fotoUrl: null } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(partidas.id, atual.id));
      if (deveInvalidarCard) {
        await excluirCardPartidaDoGcs(atual.fotoUrl);
      }
      partidasAtualizadas += 1;
    }

    return { faseCriada: null as any, faseAtualizada: faseProxima, partidasCriadas: 0, partidasAtualizadas };
  }
}

export const mataMataService = new MataMataService();
