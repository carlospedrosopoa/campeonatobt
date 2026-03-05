import { db } from "@/db";
import { categorias, grupoEquipes, grupos, inscricoes, partidas, rodadas, torneios } from "@/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";

function groupName(index: number) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < letters.length) return `Grupo ${letters[index]}`;
  const first = Math.floor(index / letters.length) - 1;
  const second = index % letters.length;
  return `Grupo ${letters[first] ?? "A"}${letters[second]}`;
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function gerarRodadasRoundRobin(teamIds: string[]) {
  const teams = [...teamIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 !== 0) teams.push("__BYE__");

  const n = teams.length;
  const rounds: { pairs: [string, string][] }[] = [];
  let arr = [...teams];
  const totalRounds = n - 1;

  for (let r = 0; r < totalRounds; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === "__BYE__" || b === "__BYE__") continue;
      pairs.push([a, b]);
    }
    rounds.push({ pairs });

    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop() as string);
    arr = [fixed, ...rest];
  }

  return rounds;
}

export class DinamicaCategoriaService {
  async gerarGruposEJogos(params: { torneioId: string; categoriaId: string }) {
    const config = await categoriaConfigService.obterOuDefault(params.categoriaId);
    if (config.formato !== "GRUPOS") {
      throw new Error("Formato da categoria não é GRUPOS");
    }

    const inscritos = await db
      .select({ equipeId: inscricoes.equipeId })
      .from(inscricoes)
      .where(and(eq(inscricoes.torneioId, params.torneioId), eq(inscricoes.categoriaId, params.categoriaId), eq(inscricoes.status, "APROVADA")));

    const equipesIds = unique(inscritos.map((i) => i.equipeId));
    if (equipesIds.length < 2) {
      throw new Error("Necessário pelo menos 2 equipes aprovadas para gerar grupos");
    }

    const modo = config.grupos?.modo ?? "AUTO";
    const tamanhoAlvo = config.grupos?.tamanhoAlvo ?? 4;
    const qtdManual = config.grupos?.quantidade;
    const qtdGrupos = modo === "MANUAL" && qtdManual ? qtdManual : Math.max(1, Math.ceil(equipesIds.length / tamanhoAlvo));

    const categoriaRow = await db.select({ id: categorias.id }).from(categorias).where(eq(categorias.id, params.categoriaId)).limit(1);
    if (!categoriaRow[0]) throw new Error("Categoria não encontrada");

    const resultado = await db.transaction(async (tx) => {
      await tx.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "GRUPOS")));
      await tx
        .delete(rodadas)
        .where(and(eq(rodadas.torneioId, params.torneioId), eq(rodadas.categoriaId, params.categoriaId), like(rodadas.nome, "Rodada %")));

      const gruposExistentes = await tx.select({ id: grupos.id }).from(grupos).where(eq(grupos.categoriaId, params.categoriaId));
      const grupoIds = gruposExistentes.map((g) => g.id);
      if (grupoIds.length > 0) {
        await tx.delete(grupoEquipes).where(inArray(grupoEquipes.grupoId, grupoIds));
        await tx.delete(grupos).where(eq(grupos.categoriaId, params.categoriaId));
      }

      const shuffled = [...equipesIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const gruposCriados: { id: string; nome: string; equipes: string[] }[] = [];
      for (let i = 0; i < qtdGrupos; i++) {
        const nome = groupName(i);
        const [g] = await tx.insert(grupos).values({ categoriaId: params.categoriaId, nome }).returning();
        gruposCriados.push({ id: g.id, nome, equipes: [] });
      }

      for (let index = 0; index < shuffled.length; index++) {
        const gIndex = index % qtdGrupos;
        gruposCriados[gIndex].equipes.push(shuffled[index]);
      }

      for (const g of gruposCriados) {
        if (g.equipes.length < 2) continue;
        await tx.insert(grupoEquipes).values(
          g.equipes.map((equipeId) => ({
            grupoId: g.id,
            equipeId,
            pontos: 0,
            jogosJogados: 0,
            jogosVencidos: 0,
            jogosPerdidos: 0,
            saldoGames: 0,
          }))
        );
      }

      const roundsByGrupo = new Map<string, { pairs: [string, string][] }[]>();
      let maxRodadas = 0;
      for (const g of gruposCriados) {
        const r = gerarRodadasRoundRobin(g.equipes);
        roundsByGrupo.set(g.id, r);
        maxRodadas = Math.max(maxRodadas, r.length);
      }

      const rodadasCriadas: { id: string; numero: number }[] = [];
      for (let numero = 1; numero <= maxRodadas; numero++) {
        const [r] = await tx
          .insert(rodadas)
          .values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            nome: `Rodada ${numero}`,
            numero,
          })
          .returning();
        rodadasCriadas.push({ id: r.id, numero });
      }

      let partidasCriadas = 0;
      for (const g of gruposCriados) {
        const rounds = roundsByGrupo.get(g.id) ?? [];
        for (let idx = 0; idx < rounds.length; idx++) {
          const rodadaNumero = idx + 1;
          const rodadaId = rodadasCriadas.find((r) => r.numero === rodadaNumero)?.id ?? null;
          for (const [a, b] of rounds[idx].pairs) {
            await tx.insert(partidas).values({
              torneioId: params.torneioId,
              categoriaId: params.categoriaId,
              rodadaId,
              grupoId: g.id,
              equipeAId: a,
              equipeBId: b,
              fase: "GRUPOS",
              status: "AGENDADA",
              placarA: 0,
              placarB: 0,
              atualizadoEm: new Date(),
            });
            partidasCriadas += 1;
          }
        }
      }

      return {
        grupos: gruposCriados.map((g) => ({ id: g.id, nome: g.nome, equipes: g.equipes.length })),
        partidasCriadas,
        equipesTotal: shuffled.length,
      };
    });

    return resultado;
  }

  async obterConfigResumo(categoriaId: string) {
    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    return {
      formato: config.formato,
      tamanhoAlvo: config.grupos?.tamanhoAlvo ?? 4,
      porGrupo: config.classificacao?.porGrupo ?? 2,
      temFinal: config.fase2?.temFinal ?? true,
    };
  }

  async excluirJogos(params: { torneioId: string; categoriaId: string }) {
    await db.transaction(async (tx) => {
      // 1. Excluir Partidas
      await tx.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId)));

      // 2. Excluir Rodadas
      await tx.delete(rodadas).where(and(eq(rodadas.torneioId, params.torneioId), eq(rodadas.categoriaId, params.categoriaId)));

      // 3. Excluir Grupos e GrupoEquipes
      const gruposExistentes = await tx.select({ id: grupos.id }).from(grupos).where(eq(grupos.categoriaId, params.categoriaId));
      const grupoIds = gruposExistentes.map((g) => g.id);
      if (grupoIds.length > 0) {
        await tx.delete(grupoEquipes).where(inArray(grupoEquipes.grupoId, grupoIds));
        await tx.delete(grupos).where(eq(grupos.categoriaId, params.categoriaId));
      }
    });
  }
}

export const dinamicaCategoriaService = new DinamicaCategoriaService();
