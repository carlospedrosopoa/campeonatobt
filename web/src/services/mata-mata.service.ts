import { db } from "@/db";
import { categorias, partidas, torneios } from "@/db/schema";
import { and, eq, inArray, not, or } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";

type Fase = "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL";

function isPowerOfTwo(n: number) {
  return n > 0 && (n & (n - 1)) === 0;
}

function faseParaQuantidade(n: number): Fase {
  if (n === 2) return "FINAL";
  if (n === 6) return "QUARTAS";
  if (n === 4) return "SEMI";
  if (n === 8) return "QUARTAS";
  return "OITAVAS";
}

const ordemFases: Fase[] = ["OITAVAS", "QUARTAS", "SEMI", "FINAL"];

function proximaFase(fase: Fase): Fase | null {
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
  private async isSuperCampeonato(params: { categoriaId: string }) {
    const rows = await db
      .select({ superCampeonato: torneios.superCampeonato })
      .from(categorias)
      .innerJoin(torneios, eq(categorias.torneioId, torneios.id))
      .where(eq(categorias.id, params.categoriaId))
      .limit(1);
    return rows[0]?.superCampeonato ?? false;
  }

  private async calcularSeeds(params: { categoriaId: string }) {
    const config = await categoriaConfigService.obterOuDefault(params.categoriaId);
    if (config.formato !== "GRUPOS") throw new Error("Formato da categoria não é GRUPOS");
    if (config.fase2?.habilitada === false) throw new Error("Fase 2 desabilitada");
    const superCampeonato = await this.isSuperCampeonato({ categoriaId: params.categoriaId });

    const porGrupo = config.classificacao?.porGrupo ?? 2;
    const melhoresTerceiros = config.classificacao?.melhoresTerceiros ?? 0;

    const grupos = await classificacaoCategoriaService.obterClassificacao(params.categoriaId);
    if (grupos.length === 0) throw new Error("Nenhum grupo encontrado");

    const qualificados: {
      equipeId: string;
      grupoId: string;
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
            rankGrupo: 999,
            pontos: e.pontos ?? 0,
            saldoGames: e.saldoGames ?? 0,
            gamesPro: e.gamesPro ?? 0,
            setsPro: (e as any).setsPro ?? 0,
            vitorias: e.jogosVencidos ?? 0,
          });
        }
      }
      restantes.sort((a, b) => {
        if (b.pontos !== a.pontos) return b.pontos - a.pontos;
        if (superCampeonato) {
          if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
          if (b.setsPro !== a.setsPro) return b.setsPro - a.setsPro;
          if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
        } else {
          if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
          if (b.gamesPro !== a.gamesPro) return b.gamesPro - a.gamesPro;
          if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
        }
        return a.equipeId.localeCompare(b.equipeId);
      });
      for (const e of restantes.slice(0, melhoresTerceiros)) qualificados.push(e);
    }

    const seeds = [...qualificados].sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (superCampeonato) {
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
        if (b.setsPro !== a.setsPro) return b.setsPro - a.setsPro;
        if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
      } else {
        if (b.saldoGames !== a.saldoGames) return b.saldoGames - a.saldoGames;
        if (b.gamesPro !== a.gamesPro) return b.gamesPro - a.gamesPro;
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
      }
      if (a.rankGrupo !== b.rankGrupo) return a.rankGrupo - b.rankGrupo;
      return a.equipeId.localeCompare(b.equipeId);
    });

    return { config, grupos, qualificados, superCampeonato, seeds: seeds.map((s) => s.equipeId) };
  }

  private async calcularPairingsProximaFase(params: { torneioId: string; categoriaId: string; faseAtual: Fase }) {
    const faseProxima = proximaFase(params.faseAtual);
    if (!faseProxima) return { faseProxima: null as any, pairings: [] as { a: string; b: string }[] };

    const jogos = await db
      .select({ id: partidas.id, status: partidas.status, vencedorId: partidas.vencedorId })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, params.faseAtual)));

    if (jogos.length === 0) return { faseProxima, pairings: [] as { a: string; b: string }[] };

    const finalizados = jogos.filter((j) => (j.status === "FINALIZADA" || j.status === "WO") && j.vencedorId);
    if (finalizados.length !== jogos.length) return { faseProxima, pairings: [] as { a: string; b: string }[] };

    const winners = finalizados
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((j) => j.vencedorId!)
      .filter(Boolean);

    const pairings: { a: string; b: string }[] = [];

    if (faseProxima === "SEMI") {
      const { seeds, superCampeonato } = await this.calcularSeeds({ categoriaId: params.categoriaId });
      if (superCampeonato) {
        const rank = new Map<string, number>();
        for (let i = 0; i < seeds.length; i++) rank.set(seeds[i], i + 1);

        const semifinalistas =
          params.faseAtual === "QUARTAS" && winners.length === 2 && seeds.length === 6
            ? [seeds[0], seeds[1], winners[0], winners[1]].filter(Boolean)
            : [...winners];

        if (semifinalistas.length !== 4) {
          throw new Error("Não foi possível montar a semifinal do Super Campeonato.");
        }

        semifinalistas.sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
        pairings.push({ a: semifinalistas[0], b: semifinalistas[3] });
        pairings.push({ a: semifinalistas[1], b: semifinalistas[2] });
        return { faseProxima, pairings };
      }
    }

    if (params.faseAtual === "QUARTAS" && winners.length === 2) {
      const { seeds } = await this.calcularSeeds({ categoriaId: params.categoriaId });
      if (seeds.length === 6) {
        const s1 = seeds[0];
        const s2 = seeds[1];
        const s3 = seeds[2];
        const s4 = seeds[3];
        const s5 = seeds[4];
        const s6 = seeds[5];

        const jogosFull = await db
          .select({ equipeAId: partidas.equipeAId, equipeBId: partidas.equipeBId, vencedorId: partidas.vencedorId })
          .from(partidas)
          .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "QUARTAS")));

        const isMatch = (m: any, a: string, b: string) =>
          (m.equipeAId === a && m.equipeBId === b) || (m.equipeAId === b && m.equipeBId === a);

        const match36 = jogosFull.find((m) => isMatch(m, s3, s6));
        const match45 = jogosFull.find((m) => isMatch(m, s4, s5));
        if (!match36?.vencedorId || !match45?.vencedorId) return { faseProxima, pairings: [] as { a: string; b: string }[] };

        pairings.push({ a: s1, b: match45.vencedorId });
        pairings.push({ a: s2, b: match36.vencedorId });
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
    const idx = ordemFases.indexOf(params.apos);
    const fases = idx >= 0 ? ordemFases.slice(idx + 1) : [];
    for (const fase of fases) {
      const existe = await db
        .select({ id: partidas.id })
        .from(partidas)
        .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, fase)))
        .limit(1);
      if (existe.length === 0) continue;
      await this.garantirSemResultados({ torneioId: params.torneioId, categoriaId: params.categoriaId, fase });
      await db.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, fase)));
    }
  }

  async resetarChaveDepoisDeFaseSePossivel(params: { torneioId: string; categoriaId: string; faseAtual: Fase }) {
    await this.limparFasesPosteriores({ torneioId: params.torneioId, categoriaId: params.categoriaId, apos: params.faseAtual });
    return { ok: true };
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

    if (faseProxima) {
      const posteriores = ordemFases.slice(ordemFases.indexOf(faseProxima));
      const jogosPosteriores = await db
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

    const updated = await db.transaction(async (tx) => {
      if (faseProxima) {
        const posteriores = ordemFases.slice(ordemFases.indexOf(faseProxima));
        await tx
          .delete(partidas)
          .where(
            and(
              eq(partidas.torneioId, params.torneioId),
              eq(partidas.categoriaId, params.categoriaId),
              inArray(partidas.fase, posteriores as any),
              or(inArray(partidas.equipeAId, teams), inArray(partidas.equipeBId, teams))
            )
          );
      }

      const [u] = await tx
        .update(partidas)
        .set({
          vencedorId: null,
          placarA: 0,
          placarB: 0,
          detalhesPlacar: null as any,
          status: "AGENDADA",
          atualizadoEm: new Date(),
        })
        .where(eq(partidas.id, params.partidaId))
        .returning();
      return u;
    });

    return updated;
  }

  async gerarPrimeiraFase(params: { torneioId: string; categoriaId: string }) {
    const { config, grupos, qualificados, seeds: seedIds } = await this.calcularSeeds({ categoriaId: params.categoriaId });
    const total = qualificados.length;
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
      const s1 = seedIds[0];
      const s2 = seedIds[1];
      const s3 = seedIds[2];
      const s4 = seedIds[3];
      const s5 = seedIds[4];
      const s6 = seedIds[5];
      if (!s1 || !s2 || !s3 || !s4 || !s5 || !s6) {
        throw new Error("Não foi possível montar a chave para 6 classificados.");
      }
      pairings.push({ a: s3, b: s6 });
      pairings.push({ a: s4, b: s5 });
    } else if (gruposOrdenados.length === 2 && (config.classificacao?.porGrupo ?? 2) >= 2 && total === 4) {
      const ga = gruposOrdenados[0].equipes;
      const gb = gruposOrdenados[1].equipes;
      pairings.push({ a: ga[0].equipeId, b: gb[1].equipeId });
      pairings.push({ a: gb[0].equipeId, b: ga[1].equipeId });
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
    const faseProxima = proximaFase(params.faseAtual);
    if (!faseProxima) return { faseCriada: null as any, faseAtualizada: null as any, partidasCriadas: 0, partidasAtualizadas: 0 };

    const existentes = await db
      .select({ id: partidas.id, status: partidas.status, vencedorId: partidas.vencedorId, placarA: partidas.placarA, placarB: partidas.placarB, detalhesPlacar: partidas.detalhesPlacar })
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
      throw new Error("Não foi possível ajustar a chave: quantidade de jogos da fase seguinte não confere.");
    }

    const sorted = existentes.slice().sort((a, b) => a.id.localeCompare(b.id));
    let partidasAtualizadas = 0;
    for (let i = 0; i < sorted.length; i++) {
      const p = calc.pairings[i];
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
          atualizadoEm: new Date(),
        })
        .where(eq(partidas.id, sorted[i].id));
      partidasAtualizadas += 1;
    }

    return { faseCriada: null as any, faseAtualizada: faseProxima, partidasCriadas: 0, partidasAtualizadas };
  }
}

export const mataMataService = new MataMataService();
