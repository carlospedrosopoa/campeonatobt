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

function gerarRodadasRoundRobinFromOrder(initial: string[]) {
  const teams = [...initial];
  if (teams.length < 2) return [];
  const hasBye = teams.includes("__BYE__");
  if (!hasBye && teams.length % 2 !== 0) teams.push("__BYE__");

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

function buildInitialOrderFromRound1Pairs(params: { teamIds: string[]; round1Pairs: [string, string][] }) {
  const teamsBase = [...params.teamIds];
  if (teamsBase.length < 2) throw new Error("Necessário pelo menos 2 equipes");
  const teams = [...teamsBase];
  if (teams.length % 2 !== 0) teams.push("__BYE__");

  const n = teams.length;
  const expectedPairs = n / 2;

  const teamsSet = new Set(teams);
  const normalizedPairs: [string, string][] = [];
  const usedTeams = new Set<string>();

  for (const [a0, b0] of params.round1Pairs) {
    const a = String(a0);
    const b = String(b0);
    if (!teamsSet.has(a) || !teamsSet.has(b)) continue;
    if (a === b) continue;
    if (usedTeams.has(a) || usedTeams.has(b)) continue;
    usedTeams.add(a);
    usedTeams.add(b);
    normalizedPairs.push(a < b ? [a, b] : [b, a]);
  }

  for (const t of teams) {
    if (!usedTeams.has(t)) {
      normalizedPairs.push(t < "__BYE__" ? [t, "__BYE__"] : ["__BYE__", t]);
      usedTeams.add(t);
      usedTeams.add("__BYE__");
    }
  }

  if (normalizedPairs.length !== expectedPairs) {
    throw new Error("Rodada 1 inválida: não cobre todas as equipes com confrontos válidos.");
  }

  normalizedPairs.sort((x, y) => {
    if (x[0] !== y[0]) return x[0].localeCompare(y[0]);
    return x[1].localeCompare(y[1]);
  });

  const positions: (string | null)[] = Array.from({ length: n }, () => null);
  const assigned = new Set<string>();

  const placePair = (index: number, pair: [string, string]) => {
    const left = index;
    const right = n - 1 - index;
    const [a, b] = pair;
    if (positions[left] || positions[right]) throw new Error("Falha ao montar ordem inicial (conflito de posições).");
    if (assigned.has(a) || assigned.has(b)) throw new Error("Falha ao montar ordem inicial (equipe repetida na rodada 1).");
    positions[left] = a;
    positions[right] = b;
    assigned.add(a);
    assigned.add(b);
  };

  placePair(0, normalizedPairs[0]);
  for (let i = 1; i < normalizedPairs.length; i++) {
    placePair(i, normalizedPairs[i]);
  }

  const order = positions.map((p) => p || "__BYE__");
  return order;
}

function partidaIniciada(p: { status?: any; vencedorId?: any; placarA?: any; placarB?: any; detalhesPlacar?: any }) {
  if (p.status && p.status !== "AGENDADA") return true;
  if (p.vencedorId) return true;
  if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
  if (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0) return true;
  return false;
}

function calcularQuantidadeGrupos(params: {
  totalEquipes: number;
  tamanhoAlvo: number;
  modo?: "AUTO" | "MANUAL";
  quantidade?: number;
  isSuperCampeonato: boolean;
}) {
  if (params.isSuperCampeonato) return 1;
  if (params.modo === "MANUAL" && params.quantidade) return params.quantidade;
  return Math.max(1, Math.ceil(params.totalEquipes / params.tamanhoAlvo));
}

function calcularTamanhosEsperados(totalEquipes: number, qtdGrupos: number) {
  if (qtdGrupos < 1) throw new Error("Quantidade de grupos inválida");
  const base = Math.floor(totalEquipes / qtdGrupos);
  const extras = totalEquipes % qtdGrupos;
  return Array.from({ length: qtdGrupos }, (_, index) => base + (index < extras ? 1 : 0));
}

async function resetarEstruturaDosGrupos(tx: any, params: { torneioId: string; categoriaId: string }) {
  await tx.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "GRUPOS")));
  await tx
    .delete(rodadas)
    .where(and(eq(rodadas.torneioId, params.torneioId), eq(rodadas.categoriaId, params.categoriaId), like(rodadas.nome, "Rodada %")));

  const gruposExistentes: { id: string }[] = await tx.select({ id: grupos.id }).from(grupos).where(eq(grupos.categoriaId, params.categoriaId));
  const grupoIds = gruposExistentes.map((g: { id: string }) => g.id);
  if (grupoIds.length > 0) {
    await tx.delete(grupoEquipes).where(inArray(grupoEquipes.grupoId, grupoIds));
    await tx.delete(grupos).where(eq(grupos.categoriaId, params.categoriaId));
  }
}

async function criarGruposComEquipes(
  tx: any,
  params: { categoriaId: string; gruposPlanejados: { nome: string; equipes: string[] }[] }
) {
  const gruposCriados: { id: string; nome: string; equipes: string[] }[] = [];

  for (const grupo of params.gruposPlanejados) {
    const [g] = await tx.insert(grupos).values({ categoriaId: params.categoriaId, nome: grupo.nome }).returning();
    gruposCriados.push({ id: g.id, nome: grupo.nome, equipes: grupo.equipes });
  }

  for (const grupo of gruposCriados) {
    if (grupo.equipes.length < 2) continue;
    await tx.insert(grupoEquipes).values(
      grupo.equipes.map((equipeId) => ({
        grupoId: grupo.id,
        equipeId,
        pontos: 0,
        jogosJogados: 0,
        jogosVencidos: 0,
        jogosPerdidos: 0,
        saldoGames: 0,
      }))
    );
  }

  return gruposCriados;
}

async function recriarRodadasEPartidasDosGrupos(
  tx: any,
  params: { torneioId: string; categoriaId: string; gruposCriados: { id: string; nome: string; equipes: string[] }[] }
) {
  await tx.delete(partidas).where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "GRUPOS")));
  await tx
    .delete(rodadas)
    .where(and(eq(rodadas.torneioId, params.torneioId), eq(rodadas.categoriaId, params.categoriaId), like(rodadas.nome, "Rodada %")));

  const roundsByGrupo = new Map<string, { pairs: [string, string][] }[]>();
  let maxRodadas = 0;
  for (const g of params.gruposCriados) {
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
  for (const g of params.gruposCriados) {
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

  return partidasCriadas;
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

    const categoriaRow = await db.select({ id: categorias.id, torneioId: categorias.torneioId }).from(categorias).where(eq(categorias.id, params.categoriaId)).limit(1);
    if (!categoriaRow[0]) throw new Error("Categoria não encontrada");

    const torneioRow = await db.select({ superCampeonato: torneios.superCampeonato }).from(torneios).where(eq(torneios.id, categoriaRow[0].torneioId)).limit(1);
    const isSuperCampeonato = torneioRow[0]?.superCampeonato ?? false;

    const resultado = await db.transaction(async (tx) => {
      await resetarEstruturaDosGrupos(tx, { torneioId: params.torneioId, categoriaId: params.categoriaId });

      const shuffled = [...equipesIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const qtdGruposCalculada = calcularQuantidadeGrupos({
        totalEquipes: equipesIds.length,
        tamanhoAlvo,
        modo,
        quantidade: qtdManual,
        isSuperCampeonato,
      });

      const gruposPlanejados = Array.from({ length: qtdGruposCalculada }, (_, index) => ({
        nome: isSuperCampeonato ? "Grupo Único" : groupName(index),
        equipes: [] as string[],
      }));

      for (let index = 0; index < shuffled.length; index++) {
        const gIndex = index % qtdGruposCalculada;
        gruposPlanejados[gIndex].equipes.push(shuffled[index]);
      }

      const gruposCriados = await criarGruposComEquipes(tx, {
        categoriaId: params.categoriaId,
        gruposPlanejados,
      });

      const partidasCriadas = await recriarRodadasEPartidasDosGrupos(tx, {
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        gruposCriados,
      });

      return {
        grupos: gruposCriados.map((g) => ({ id: g.id, nome: g.nome, equipes: g.equipes.length })),
        partidasCriadas,
        equipesTotal: shuffled.length,
      };
    });

    return resultado;
  }

  async montarGruposManualmente(params: {
    torneioId: string;
    categoriaId: string;
    grupos: { nome: string; equipes: string[] }[];
  }) {
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
      throw new Error("Necessário pelo menos 2 equipes aprovadas para montar grupos");
    }

    const categoriaRow = await db.select({ id: categorias.id, torneioId: categorias.torneioId }).from(categorias).where(eq(categorias.id, params.categoriaId)).limit(1);
    if (!categoriaRow[0]) throw new Error("Categoria não encontrada");

    const torneioRow = await db.select({ superCampeonato: torneios.superCampeonato }).from(torneios).where(eq(torneios.id, categoriaRow[0].torneioId)).limit(1);
    const isSuperCampeonato = torneioRow[0]?.superCampeonato ?? false;

    const modo = config.grupos?.modo ?? "AUTO";
    const tamanhoAlvo = config.grupos?.tamanhoAlvo ?? 4;
    const qtdManual = config.grupos?.quantidade;
    const qtdGruposEsperada = calcularQuantidadeGrupos({
      totalEquipes: equipesIds.length,
      tamanhoAlvo,
      modo,
      quantidade: qtdManual,
      isSuperCampeonato,
    });
    const tamanhosEsperados = calcularTamanhosEsperados(equipesIds.length, qtdGruposEsperada);
    if (tamanhosEsperados.some((t) => t < 2)) {
      throw new Error("A configuração atual gera grupo com menos de 2 duplas. Ajuste a quantidade ou o tamanho alvo antes de montar manualmente.");
    }

    const equipesAprovadasSet = new Set(equipesIds);
    const equipesAlocadas = new Set<string>();
    const gruposNormalizados = params.grupos.map((grupo, index) => {
      const nome = (grupo.nome || "").trim() || (isSuperCampeonato ? "Grupo Único" : groupName(index));
      const equipesGrupo = unique((grupo.equipes ?? []).map((id) => String(id || "").trim()).filter(Boolean));
      if (equipesGrupo.length === 0) {
        throw new Error(`O ${nome} está vazio`);
      }
      for (const equipeId of equipesGrupo) {
        if (!equipesAprovadasSet.has(equipeId)) {
          throw new Error("Há duplas inválidas na montagem manual dos grupos");
        }
        if (equipesAlocadas.has(equipeId)) {
          throw new Error("Uma mesma dupla foi informada mais de uma vez na montagem manual");
        }
        equipesAlocadas.add(equipeId);
      }
      return { nome, equipes: equipesGrupo };
    });

    if (gruposNormalizados.length !== qtdGruposEsperada) {
      throw new Error(`Quantidade de grupos inválida. Esperado: ${qtdGruposEsperada}.`);
    }

    if (equipesAlocadas.size !== equipesIds.length) {
      throw new Error("Informe um grupo para todas as duplas aprovadas antes de confirmar");
    }

    const nomesUnicos = new Set(gruposNormalizados.map((grupo) => grupo.nome));
    if (nomesUnicos.size !== gruposNormalizados.length) {
      throw new Error("Os nomes dos grupos precisam ser únicos");
    }

    const tamanhosRecebidos = gruposNormalizados.map((grupo) => grupo.equipes.length).sort((a, b) => b - a);
    const tamanhosEsperadosOrdenados = [...tamanhosEsperados].sort((a, b) => b - a);
    if (JSON.stringify(tamanhosRecebidos) !== JSON.stringify(tamanhosEsperadosOrdenados)) {
      throw new Error(`Distribuição inválida. Esperado: ${tamanhosEsperadosOrdenados.join(", ")} duplas por grupo.`);
    }

    const resultado = await db.transaction(async (tx) => {
      await resetarEstruturaDosGrupos(tx, { torneioId: params.torneioId, categoriaId: params.categoriaId });
      const gruposCriados = await criarGruposComEquipes(tx, {
        categoriaId: params.categoriaId,
        gruposPlanejados: gruposNormalizados,
      });
      const partidasCriadas = await recriarRodadasEPartidasDosGrupos(tx, {
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        gruposCriados,
      });

      return {
        grupos: gruposCriados.map((g) => ({ id: g.id, nome: g.nome, equipes: g.equipes.length })),
        partidasCriadas,
        equipesTotal: equipesIds.length,
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
      const gruposExistentes: { id: string }[] = await tx.select({ id: grupos.id }).from(grupos).where(eq(grupos.categoriaId, params.categoriaId));
      const grupoIds = gruposExistentes.map((g: { id: string }) => g.id);
      if (grupoIds.length > 0) {
        await tx.delete(grupoEquipes).where(inArray(grupoEquipes.grupoId, grupoIds));
        await tx.delete(grupos).where(eq(grupos.categoriaId, params.categoriaId));
      }
    });
  }

  async trocarEquipesEntreGrupos(params: { torneioId: string; categoriaId: string; equipeOrigemId: string; equipeDestinoId: string }) {
    if (params.equipeOrigemId === params.equipeDestinoId) {
      throw new Error("Escolha duas duplas diferentes para trocar");
    }

    const partidasGrupo = await db
      .select({
        id: partidas.id,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "GRUPOS")));

    if (partidasGrupo.some(partidaIniciada)) {
      throw new Error("Não é possível trocar duplas entre grupos depois que a fase de grupos começou");
    }

    const gruposRows = await db
      .select({
        grupoId: grupos.id,
        grupoNome: grupos.nome,
        equipeId: grupoEquipes.equipeId,
      })
      .from(grupos)
      .innerJoin(grupoEquipes, eq(grupoEquipes.grupoId, grupos.id))
      .where(eq(grupos.categoriaId, params.categoriaId));

    if (gruposRows.length === 0) {
      throw new Error("Nenhum grupo encontrado para esta categoria");
    }

    const gruposMap = new Map<string, { id: string; nome: string; equipes: string[] }>();
    for (const row of gruposRows) {
      const atual = gruposMap.get(row.grupoId) ?? { id: row.grupoId, nome: row.grupoNome, equipes: [] };
      atual.equipes.push(row.equipeId);
      gruposMap.set(row.grupoId, atual);
    }

    const gruposCriados = Array.from(gruposMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    let grupoOrigemId: string | null = null;
    let grupoDestinoId: string | null = null;

    for (const grupo of gruposCriados) {
      if (grupo.equipes.includes(params.equipeOrigemId)) grupoOrigemId = grupo.id;
      if (grupo.equipes.includes(params.equipeDestinoId)) grupoDestinoId = grupo.id;
    }

    if (!grupoOrigemId || !grupoDestinoId) {
      throw new Error("Não foi possível encontrar as duas duplas nos grupos atuais");
    }
    if (grupoOrigemId === grupoDestinoId) {
      throw new Error("As duas duplas já estão no mesmo grupo");
    }

    for (const grupo of gruposCriados) {
      grupo.equipes = grupo.equipes.map((equipeId) => {
        if (equipeId === params.equipeOrigemId) return params.equipeDestinoId;
        if (equipeId === params.equipeDestinoId) return params.equipeOrigemId;
        return equipeId;
      });
    }

    const grupoIds = gruposCriados.map((g) => g.id);
    const partidasCriadas = await db.transaction(async (tx) => {
      await tx.delete(grupoEquipes).where(inArray(grupoEquipes.grupoId, grupoIds));

      for (const grupo of gruposCriados) {
        await tx.insert(grupoEquipes).values(
          grupo.equipes.map((equipeId) => ({
            grupoId: grupo.id,
            equipeId,
            pontos: 0,
            jogosJogados: 0,
            jogosVencidos: 0,
            jogosPerdidos: 0,
            saldoGames: 0,
          }))
        );
      }

      return recriarRodadasEPartidasDosGrupos(tx, {
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        gruposCriados,
      });
    });

    return { gruposAtualizados: gruposCriados.length, partidasCriadas };
  }

  async gerarRodadasRestantesSuperCampeonato(params: { torneioId: string; categoriaId: string; aPartirDaRodada?: number }) {
    const categoriaRow = await db.select({ id: categorias.id, torneioId: categorias.torneioId }).from(categorias).where(eq(categorias.id, params.categoriaId)).limit(1);
    if (!categoriaRow[0]) throw new Error("Categoria não encontrada");

    const torneioRow = await db.select({ superCampeonato: torneios.superCampeonato }).from(torneios).where(eq(torneios.id, categoriaRow[0].torneioId)).limit(1);
    const isSuperCampeonato = torneioRow[0]?.superCampeonato ?? false;
    if (!isSuperCampeonato) throw new Error("Recurso disponível apenas para torneios Super Campeonato");

    const aPartirDaRodada = params.aPartirDaRodada ?? 2;

    const gruposRows = await db.select({ id: grupos.id }).from(grupos).where(eq(grupos.categoriaId, params.categoriaId));
    const grupoId = gruposRows[0]?.id;
    if (!grupoId) throw new Error("Nenhum grupo encontrado");

    const equipesRows = await db
      .select({ equipeId: grupoEquipes.equipeId })
      .from(grupoEquipes)
      .where(eq(grupoEquipes.grupoId, grupoId));
    const teamIds = unique(equipesRows.map((e) => e.equipeId));
    if (teamIds.length < 2) throw new Error("Necessário pelo menos 2 equipes no grupo");

    const rodadasRows = await db
      .select({ id: rodadas.id, numero: rodadas.numero, nome: rodadas.nome })
      .from(rodadas)
      .where(and(eq(rodadas.torneioId, params.torneioId), eq(rodadas.categoriaId, params.categoriaId), like(rodadas.nome, "Rodada %")));
    const rodadaIdByNumero = new Map<number, string>();
    for (const r of rodadasRows) {
      if (typeof r.numero === "number") rodadaIdByNumero.set(r.numero, r.id);
    }
    const rodadaIdsFrom = rodadasRows.filter((r) => (r.numero ?? 0) >= aPartirDaRodada).map((r) => r.id);
    const rodadaNumerosFrom = rodadasRows.filter((r) => (r.numero ?? 0) >= aPartirDaRodada).map((r) => r.numero).filter((n): n is number => typeof n === "number");

    const partidasRows = await db
      .select({
        id: partidas.id,
        rodadaId: partidas.rodadaId,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "GRUPOS")));

    const getNumero = (rodadaId: string | null) => (rodadaId ? Array.from(rodadaIdByNumero.entries()).find(([, id]) => id === rodadaId)?.[0] ?? null : null);

    const partidaIniciada = (p: any) => {
      if (p.status && p.status !== "AGENDADA") return true;
      if (p.vencedorId) return true;
      if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
      if (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0) return true;
      return false;
    };

    const partidasFuturas = partidasRows.filter((p) => {
      const n = getNumero(p.rodadaId);
      return n !== null && n >= aPartirDaRodada;
    });

    if (partidasFuturas.some(partidaIniciada)) {
      throw new Error("Não é possível gerar rodadas restantes: já existem partidas com resultado nas rodadas seguintes.");
    }

    const rodada1Pairs = partidasRows
      .filter((p) => getNumero(p.rodadaId) === 1)
      .map((p) => [p.equipeAId, p.equipeBId] as [string, string])
      .filter((p) => Boolean(p[0]) && Boolean(p[1]));

    if (rodada1Pairs.length === 0) {
      throw new Error("Nenhum confronto encontrado na Rodada 1. Ajuste os confrontos da 1ª rodada antes de gerar as demais.");
    }

    const initialOrder = buildInitialOrderFromRound1Pairs({ teamIds, round1Pairs: rodada1Pairs });
    const rounds = gerarRodadasRoundRobinFromOrder(initialOrder);
    const maxRodadas = rounds.length;

    const resultado = await db.transaction(async (tx) => {
      if (rodadaIdsFrom.length > 0) {
        await tx.delete(partidas).where(inArray(partidas.rodadaId, rodadaIdsFrom));
        await tx.delete(rodadas).where(inArray(rodadas.id, rodadaIdsFrom));
      }
      for (const n of rodadaNumerosFrom) rodadaIdByNumero.delete(n);

      const rodadasCriadas: { id: string; numero: number }[] = [];
      for (let numero = 1; numero <= maxRodadas; numero++) {
        const existingId = rodadaIdByNumero.get(numero);
        if (existingId) continue;
        const [r] = await tx
          .insert(rodadas)
          .values({ torneioId: params.torneioId, categoriaId: params.categoriaId, nome: `Rodada ${numero}`, numero })
          .returning();
        rodadaIdByNumero.set(numero, r.id);
        rodadasCriadas.push({ id: r.id, numero });
      }

      let partidasCriadas = 0;
      for (let idx = aPartirDaRodada - 1; idx < rounds.length; idx++) {
        const rodadaNumero = idx + 1;
        const rodadaId = rodadaIdByNumero.get(rodadaNumero) ?? null;
        if (!rodadaId) continue;
        for (const [a, b] of rounds[idx].pairs) {
          await tx.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            rodadaId,
            grupoId,
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

      return { maxRodadas, rodadasCriadas: rodadasCriadas.length, partidasCriadas };
    });

    return resultado;
  }
}

export const dinamicaCategoriaService = new DinamicaCategoriaService();
