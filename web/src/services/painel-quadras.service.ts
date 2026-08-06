import { db } from "@/db";
import { arenas, categorias, grupos, partidas, torneios } from "@/db/schema";
import { obterRegrasPartidaEfetivas, type RegrasPartidaConfig, type RegrasPartidaSets } from "@/lib/regras-partida";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { deveInvalidarCardPartida, excluirCardPartidaDoGcs } from "@/services/partida-card-cache.service";

const ACTIVE_MATCH_STATUSES = ["AGENDADA", "EM_ANDAMENTO"] as const;

type ActiveStatus = (typeof ACTIVE_MATCH_STATUSES)[number];

type PainelQuadraReservaConfig = {
  quadraNumero: number;
  categoriaId: string | null;
  fase: string | null;
  grupoId: string | null;
  proximaPartidaId: string | null;
};

export type PainelQuadrasPartida = {
  id: string;
  categoriaId: string;
  categoriaNome: string;
  fase: string;
  grupoId: string | null;
  grupoNome: string | null;
  status: string;
  arenaId: string | null;
  arenaNome: string | null;
  quadra: string | null;
  dataHorario: string | null;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  equipeAId: string;
  equipeBId: string;
  equipeANome: string | null;
  equipeBNome: string | null;
  placarA: number;
  placarB: number;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  regrasPartida?: RegrasPartidaConfig | RegrasPartidaSets | null;
};

type ChaveDisponivelPainel = {
  categoriaId: string;
  categoriaNome: string;
  fase: string;
  grupoId: string | null;
  grupoNome: string | null;
  descricao: string;
  partidasPendentes: number;
  partidasEmAndamento: number;
  totalEmAberto: number;
};

type QuadraReservaPainel = ChaveDisponivelPainel & {
  quadraNumero: number;
};

type QuadraCard = {
  numero: number;
  nome: string;
  partidaAtual: PainelQuadrasPartida | null;
  reservaChave: QuadraReservaPainel | null;
  proximaPartidaReserva: PainelQuadrasPartida | null;
  proximaPartidaManual: PainelQuadrasPartida | null;
  filaPartidas: PainelQuadrasPartida[];
};

export type PainelQuadrasQuadraCard = QuadraCard;
export type PainelQuadrasChaveDisponivel = ChaveDisponivelPainel;

function nomeQuadra(numero: number) {
  return `Quadra ${numero}`;
}

function temReservaEscopo(config?: Pick<PainelQuadraReservaConfig, "categoriaId" | "fase"> | null) {
  return Boolean(config?.categoriaId && config?.fase);
}

function chaveEscopoKey(params: { categoriaId: string; fase: string; grupoId?: string | null }) {
  return `${params.categoriaId}::${params.fase}::${params.grupoId ?? ""}`;
}

function resumoChave(params: { categoriaNome: string; fase: string; grupoNome?: string | null }) {
  if (params.fase === "GRUPOS" && params.grupoNome) return `${params.categoriaNome} • ${params.grupoNome}`;
  return `${params.categoriaNome} • ${params.fase}`;
}

function isActiveStatus(status: string): status is ActiveStatus {
  return ACTIVE_MATCH_STATUSES.includes(status as ActiveStatus);
}

function ordemStatus(status: string) {
  if (status === "EM_ANDAMENTO") return 0;
  if (status === "AGENDADA") return 1;
  return 2;
}

function ordenarPartidasPainel(a: PainelQuadrasPartida, b: PainelQuadrasPartida) {
  const prioridade = ordemStatus(a.status) - ordemStatus(b.status);
  if (prioridade !== 0) return prioridade;

  const dataA = a.dataHorario ? new Date(a.dataHorario).getTime() : Number.MAX_SAFE_INTEGER;
  const dataB = b.dataHorario ? new Date(b.dataHorario).getTime() : Number.MAX_SAFE_INTEGER;
  if (dataA !== dataB) return dataA - dataB;

  const categoria = a.categoriaNome.localeCompare(b.categoriaNome, "pt-BR", { sensitivity: "base" });
  if (categoria !== 0) return categoria;

  return a.id.localeCompare(b.id);
}

export class PainelQuadrasService {
  async listar(torneioId: string) {
    const torneioRows = await db
      .select({
        id: torneios.id,
        nome: torneios.nome,
        slug: torneios.slug,
        quadrasAtivas: torneios.quadrasAtivas,
        painelQuadrasReservas: torneios.painelQuadrasReservas,
        superCampeonato: torneios.superCampeonato,
        superCampeonatoFormato: torneios.superCampeonatoFormato,
      })
      .from(torneios)
      .where(eq(torneios.id, torneioId))
      .limit(1);

    const torneio = torneioRows[0];
    if (!torneio) throw new Error("Torneio não encontrado");

    const arenaRows = await db
      .select({
        id: arenas.id,
        nome: arenas.nome,
      })
      .from(arenas)
      .where(eq(arenas.torneioId, torneioId))
      .orderBy(asc(arenas.nome));

    const rows = await db
      .select({
        id: partidas.id,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        fase: partidas.fase,
        grupoId: partidas.grupoId,
        grupoNome: grupos.nome,
        status: partidas.status,
        arenaId: partidas.arenaId,
        arenaNome: arenas.nome,
        quadra: partidas.quadra,
        dataHorario: partidas.dataHorario,
        iniciadoEm: partidas.iniciadoEm,
        finalizadoEm: partidas.finalizadoEm,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .leftJoin(grupos, eq(partidas.grupoId, grupos.id))
      .leftJoin(arenas, eq(partidas.arenaId, arenas.id))
      .where(eq(partidas.torneioId, torneioId))
      .orderBy(asc(categorias.nome), asc(partidas.dataHorario), asc(partidas.criadoEm));

    const equipeIds = Array.from(new Set(rows.flatMap((row) => [row.equipeAId, row.equipeBId]).filter(Boolean))) as string[];
    const nomesEquipes = await equipesDisplayService.mapNomesEquipes(equipeIds);
    const categoriaIds = Array.from(new Set(rows.map((row) => row.categoriaId).filter(Boolean))) as string[];
    const configEntries = await Promise.all(
      categoriaIds.map(async (categoriaId) => [categoriaId, await categoriaConfigService.obterOuDefault(categoriaId)] as const)
    );
    const configMap = new Map(configEntries);

    const partidasComNomes: PainelQuadrasPartida[] = rows.map((row) => {
      const config = configMap.get(row.categoriaId);
      return {
        id: row.id,
        categoriaId: row.categoriaId,
        categoriaNome: row.categoriaNome,
        fase: row.fase,
        grupoId: row.grupoId ?? null,
        grupoNome: row.grupoNome ?? null,
        status: row.status,
        arenaId: row.arenaId ?? null,
        arenaNome: row.arenaNome ?? null,
        quadra: row.quadra ?? null,
        dataHorario: row.dataHorario ? new Date(row.dataHorario).toISOString() : null,
        iniciadoEm: row.iniciadoEm ? new Date(row.iniciadoEm).toISOString() : null,
        finalizadoEm: row.finalizadoEm ? new Date(row.finalizadoEm).toISOString() : null,
        equipeAId: row.equipeAId,
        equipeBId: row.equipeBId,
        equipeANome: nomesEquipes.get(row.equipeAId) ?? null,
        equipeBNome: nomesEquipes.get(row.equipeBId) ?? null,
        placarA: row.placarA ?? 0,
        placarB: row.placarB ?? 0,
        detalhesPlacar: (row.detalhesPlacar as PainelQuadrasPartida["detalhesPlacar"]) ?? null,
        regrasPartida: obterRegrasPartidaEfetivas({
          regrasBase: config?.regrasPartida,
          regrasPorFase: config?.regrasPartidaPorFase ?? null,
          fase: row.fase,
          superCampeonato: torneio.superCampeonato,
          superCampeonatoFormato: torneio.superCampeonatoFormato,
        }),
      };
    });

    const partidasAbertas = partidasComNomes.filter((partida) => isActiveStatus(partida.status)).slice().sort(ordenarPartidasPainel);
    const partidasAgendadasSemQuadraAtiva = new Map<string, PainelQuadrasPartida>();
    const chavesAbertasMap = new Map<string, ChaveDisponivelPainel>();
    const proximasPartidasPorChave = new Map<string, PainelQuadrasPartida>();
    const partidasAbertasPorChave = new Map<string, PainelQuadrasPartida[]>();

    for (const partida of partidasAbertas) {
      if (!isActiveStatus(partida.status)) continue;
      const key = chaveEscopoKey(partida);
      const existente = chavesAbertasMap.get(key);
      if (existente) {
        if (partida.status === "AGENDADA") existente.partidasPendentes += 1;
        if (partida.status === "EM_ANDAMENTO") existente.partidasEmAndamento += 1;
        existente.totalEmAberto += 1;
      } else {
        chavesAbertasMap.set(key, {
          categoriaId: partida.categoriaId,
          categoriaNome: partida.categoriaNome,
          fase: partida.fase,
          grupoId: partida.grupoId,
          grupoNome: partida.grupoNome,
          descricao: resumoChave(partida),
          partidasPendentes: partida.status === "AGENDADA" ? 1 : 0,
          partidasEmAndamento: partida.status === "EM_ANDAMENTO" ? 1 : 0,
          totalEmAberto: 1,
        });
      }

      if (partida.status === "AGENDADA" && !proximasPartidasPorChave.has(key)) {
        proximasPartidasPorChave.set(key, partida);
      }

      const partidasDaChave = partidasAbertasPorChave.get(key) ?? [];
      partidasDaChave.push(partida);
      partidasAbertasPorChave.set(key, partidasDaChave);

    }

    const quadrasAtivas = Math.max(0, torneio.quadrasAtivas ?? 0);
    const configuracoesNormalizadas = this.normalizarReservasQuadras(torneio.painelQuadrasReservas);

    const courtNames = new Set<string>();
    for (let i = 1; i <= quadrasAtivas; i += 1) {
      courtNames.add(nomeQuadra(i));
    }

    const fila = partidasComNomes.filter((partida) => {
      if (partida.status !== "AGENDADA") return false;
      const quadra = (partida.quadra || "").trim();
      return !quadra || !courtNames.has(quadra);
    });

    for (const partida of fila) {
      partidasAgendadasSemQuadraAtiva.set(partida.id, partida);
    }

    const configuracoesAtivas = configuracoesNormalizadas
      .filter((config) => config.quadraNumero >= 1 && config.quadraNumero <= quadrasAtivas)
      .map((config) => {
        const reservaValida = temReservaEscopo(config) && chavesAbertasMap.has(chaveEscopoKey({
          categoriaId: config.categoriaId as string,
          fase: config.fase as string,
          grupoId: config.grupoId ?? null,
        }));

        const categoriaId = reservaValida ? config.categoriaId : null;
        const fase = reservaValida ? config.fase : null;
        const grupoId = reservaValida ? (config.grupoId ?? null) : null;

        let proximaPartidaId = config.proximaPartidaId ?? null;
        const partidaPrioritaria = proximaPartidaId ? partidasAgendadasSemQuadraAtiva.get(proximaPartidaId) ?? null : null;
        const prioridadeValida =
          !!partidaPrioritaria &&
          (!reservaValida ||
            chaveEscopoKey(partidaPrioritaria) ===
              chaveEscopoKey({
                categoriaId: categoriaId as string,
                fase: fase as string,
                grupoId,
              }));

        if (!prioridadeValida) {
          proximaPartidaId = null;
        }

        return {
          quadraNumero: config.quadraNumero,
          categoriaId,
          fase,
          grupoId,
          proximaPartidaId,
        };
      })
      .filter((config) => temReservaEscopo(config) || config.proximaPartidaId);

    if (JSON.stringify(configuracoesAtivas) !== JSON.stringify(configuracoesNormalizadas)) {
      await db
        .update(torneios)
        .set({
          painelQuadrasReservas: configuracoesAtivas.length ? (configuracoesAtivas as any) : null,
          atualizadoEm: new Date(),
        })
        .where(eq(torneios.id, torneioId));
    }

    const reservaPorQuadra = new Map<number, QuadraReservaPainel>();
    const configPorQuadra = new Map<number, PainelQuadraReservaConfig>();
    for (const config of configuracoesAtivas) {
      configPorQuadra.set(config.quadraNumero, config);
      if (!temReservaEscopo(config)) continue;
      const chave = chavesAbertasMap.get(
        chaveEscopoKey({
          categoriaId: config.categoriaId as string,
          fase: config.fase as string,
          grupoId: config.grupoId ?? null,
        })
      );
      if (!chave) continue;
      reservaPorQuadra.set(config.quadraNumero, {
        quadraNumero: config.quadraNumero,
        ...chave,
      });
    }

    const quadrasMap = new Map<string, QuadraCard>();
    for (let i = 1; i <= quadrasAtivas; i += 1) {
      const nome = nomeQuadra(i);
      quadrasMap.set(nome, {
        numero: i,
        nome,
        partidaAtual: null,
        reservaChave: reservaPorQuadra.get(i) ?? null,
        proximaPartidaReserva: null,
        proximaPartidaManual: null,
        filaPartidas: [],
      });
    }

    const activeAssignedMatches = partidasAbertas
      .filter((partida) => Boolean(partida.quadra) && isActiveStatus(partida.status))
      .slice()
      .sort(ordenarPartidasPainel);

    for (const partida of activeAssignedMatches) {
      const quadra = (partida.quadra || "").trim();
      if (!courtNames.has(quadra)) continue;
      const current = quadrasMap.get(quadra);
      if (!current || current.partidaAtual) continue;
      current.partidaAtual = partida;
    }

    for (const quadra of quadrasMap.values()) {
      const config = configPorQuadra.get(quadra.numero) ?? null;
      if (quadra.reservaChave) {
        const key = chaveEscopoKey(quadra.reservaChave);
        quadra.proximaPartidaReserva = proximasPartidasPorChave.get(key) ?? null;
        quadra.filaPartidas = fila.filter((partida) => chaveEscopoKey(partida) === key);
      } else {
        quadra.filaPartidas = fila.slice();
      }

      quadra.proximaPartidaManual =
        config?.proximaPartidaId ? quadra.filaPartidas.find((partida) => partida.id === config.proximaPartidaId) ?? null : null;
    }

    const historicoRecente = partidasComNomes
      .filter((partida) => partida.status === "FINALIZADA" || partida.status === "WO")
      .slice()
      .sort((a, b) => {
        const timeA = a.finalizadoEm ? new Date(a.finalizadoEm).getTime() : 0;
        const timeB = b.finalizadoEm ? new Date(b.finalizadoEm).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 8);

    const duracoesMinutos = partidasComNomes
      .map((partida) => {
        if (!partida.iniciadoEm || !partida.finalizadoEm) return null;
        const inicio = new Date(partida.iniciadoEm).getTime();
        const fim = new Date(partida.finalizadoEm).getTime();
        if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return null;
        return Math.round((fim - inicio) / 60000);
      })
      .filter((minutos): minutos is number => minutos !== null);

    const tempoMedioMinutos =
      duracoesMinutos.length > 0
        ? Math.round(duracoesMinutos.reduce((total, valor) => total + valor, 0) / duracoesMinutos.length)
        : null;

    const quadras = Array.from(quadrasMap.values()).sort((a, b) => a.numero - b.numero);
    const quadrasOcupadas = quadras.filter((quadra) => quadra.partidaAtual && quadra.partidaAtual.status === "EM_ANDAMENTO").length;
    const quadrasReservadas = quadras.filter((quadra) => quadra.partidaAtual && quadra.partidaAtual.status === "AGENDADA").length;

    return {
      torneio,
      arenas: arenaRows,
      quadras,
      fila,
      chavesDisponiveis: Array.from(chavesAbertasMap.values()).sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR")),
      historicoRecente,
      stats: {
        quadrasAtivas,
        quadrasLivres: Math.max(0, quadrasAtivas - quadras.filter((quadra) => quadra.partidaAtual).length),
        quadrasOcupadas,
        quadrasReservadas,
        jogosNaFila: fila.length,
        jogosFinalizados: historicoRecente.length,
        tempoMedioMinutos,
      },
    };
  }

  async salvarConfigQuadras(params: { torneioId: string; quadrasAtivas: number }) {
    const quadrasAtivas = Math.max(0, Math.min(20, Math.trunc(Number(params.quadrasAtivas) || 0)));

    const torneioRows = await db
      .select({
        id: torneios.id,
        painelQuadrasReservas: torneios.painelQuadrasReservas,
      })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);

    const torneio = torneioRows[0];
    const reservas = this
      .normalizarReservasQuadras(torneio?.painelQuadrasReservas)
      .filter((item) => item.quadraNumero >= 1 && item.quadraNumero <= quadrasAtivas);

    const [updated] = await db
      .update(torneios)
      .set({
        quadrasAtivas,
        painelQuadrasReservas: reservas.length ? (reservas as any) : null,
        atualizadoEm: new Date(),
      })
      .where(eq(torneios.id, params.torneioId))
      .returning({
        id: torneios.id,
        quadrasAtivas: torneios.quadrasAtivas,
      });

    return updated ?? null;
  }

  async alocarPartida(params: { torneioId: string; partidaId: string; quadraNumero: number; arenaId?: string | null }) {
    const quadraNumero = Math.max(1, Math.min(99, Math.trunc(Number(params.quadraNumero) || 0)));
    if (!quadraNumero) throw new Error("Quadra inválida");

    const quadra = nomeQuadra(quadraNumero);
    const partida = await this.buscarPartidaOperacional(params.torneioId, params.partidaId);
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.status === "FINALIZADA" || partida.status === "WO" || partida.status === "CANCELADA") {
      throw new Error("Não é possível alocar uma partida já encerrada");
    }

    if (params.arenaId) {
      const arenaRow = await db
        .select({ id: arenas.id })
        .from(arenas)
        .where(and(eq(arenas.id, params.arenaId), eq(arenas.torneioId, params.torneioId)))
        .limit(1);
      if (!arenaRow[0]) throw new Error("Arena inválida para o torneio");
    }

    await this.validarReservaQuadra(params.torneioId, quadraNumero, partida);
    await this.validarQuadraDisponivel(params.torneioId, quadra, params.partidaId);

    const deveInvalidarCard = deveInvalidarCardPartida(partida, {
      dataHorario: partida.dataHorario,
      arenaId: params.arenaId ?? null,
      quadra,
      equipeAId: partida.equipeAId,
      equipeBId: partida.equipeBId,
    });

    const [updated] = await db
      .update(partidas)
      .set({
        quadra,
        arenaId: params.arenaId ?? null,
        ...(deveInvalidarCard ? { fotoUrl: null } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, params.partidaId))
      .returning();

    if (deveInvalidarCard) {
      await excluirCardPartidaDoGcs(partida.fotoUrl);
    }

    return updated;
  }

  async retirarDaQuadra(params: { torneioId: string; partidaId: string }) {
    const partida = await this.buscarPartidaOperacional(params.torneioId, params.partidaId);
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.status !== "AGENDADA") throw new Error("Só é possível retirar da quadra partidas ainda não iniciadas");

    const deveInvalidarCard = deveInvalidarCardPartida(partida, {
      dataHorario: partida.dataHorario,
      arenaId: null,
      quadra: null,
      equipeAId: partida.equipeAId,
      equipeBId: partida.equipeBId,
    });

    const [updated] = await db
      .update(partidas)
      .set({
        quadra: null,
        arenaId: null,
        ...(deveInvalidarCard ? { fotoUrl: null } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, params.partidaId))
      .returning();

    if (deveInvalidarCard) {
      await excluirCardPartidaDoGcs(partida.fotoUrl);
    }

    return updated;
  }

  async iniciarPartida(params: { torneioId: string; partidaId: string }) {
    const partida = await this.buscarPartidaOperacional(params.torneioId, params.partidaId);
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.status !== "AGENDADA") throw new Error("A partida já foi iniciada ou encerrada");
    if (!partida.quadra) throw new Error("Alocação na quadra é obrigatória antes de iniciar");

    await this.validarQuadraDisponivel(params.torneioId, partida.quadra, params.partidaId, true);

    const [updated] = await db
      .update(partidas)
      .set({
        status: "EM_ANDAMENTO",
        iniciadoEm: new Date(),
        finalizadoEm: null,
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, params.partidaId))
      .returning();

    return updated;
  }

  async voltarParaAguardando(params: { torneioId: string; partidaId: string }) {
    const partida = await this.buscarPartidaOperacional(params.torneioId, params.partidaId);
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.status !== "EM_ANDAMENTO") throw new Error("Só é possível voltar partidas em andamento");

    const [updated] = await db
      .update(partidas)
      .set({
        status: "AGENDADA",
        iniciadoEm: null,
        finalizadoEm: null,
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, params.partidaId))
      .returning();

    return updated;
  }

  async reservarQuadraParaChave(params: {
    torneioId: string;
    quadraNumero: number;
    categoriaId: string;
    fase: string;
    grupoId?: string | null;
  }) {
    const quadraNumero = Math.max(1, Math.min(99, Math.trunc(Number(params.quadraNumero) || 0)));
    if (!quadraNumero) throw new Error("Quadra inválida");

    const torneioRows = await db
      .select({
        id: torneios.id,
        quadrasAtivas: torneios.quadrasAtivas,
        painelQuadrasReservas: torneios.painelQuadrasReservas,
      })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);

    const torneio = torneioRows[0];
    if (!torneio) throw new Error("Torneio não encontrado");
    if (quadraNumero > Math.max(0, torneio.quadrasAtivas ?? 0)) throw new Error("Quadra fora da quantidade ativa do painel");

    const grupoId = params.grupoId?.trim() ? params.grupoId : null;
    const partidaCompativel = await db
      .select({ id: partidas.id })
      .from(partidas)
      .where(
        and(
          eq(partidas.torneioId, params.torneioId),
          eq(partidas.categoriaId, params.categoriaId),
          eq(partidas.fase, params.fase as any),
          grupoId ? eq(partidas.grupoId, grupoId) : isNull(partidas.grupoId),
          inArray(partidas.status, ACTIVE_MATCH_STATUSES)
        )
      )
      .limit(1);

    if (!partidaCompativel[0]) {
      throw new Error("Essa chave não possui jogos em aberto para reservar a quadra");
    }

    const reservas = this.normalizarReservasQuadras(torneio.painelQuadrasReservas).filter((item) => item.quadraNumero !== quadraNumero);
    const atual = this.normalizarReservasQuadras(torneio.painelQuadrasReservas).find((item) => item.quadraNumero === quadraNumero);
    const proximaPartidaId =
      atual?.proximaPartidaId && atual.categoriaId === params.categoriaId && atual.fase === params.fase && (atual.grupoId ?? null) === grupoId
        ? atual.proximaPartidaId
        : null;
    reservas.push({
      quadraNumero,
      categoriaId: params.categoriaId,
      fase: params.fase,
      grupoId,
      proximaPartidaId,
    });

    await db
      .update(torneios)
      .set({
        painelQuadrasReservas: reservas as any,
        atualizadoEm: new Date(),
      })
      .where(eq(torneios.id, params.torneioId));

    return { ok: true };
  }

  async liberarReservaQuadra(params: { torneioId: string; quadraNumero: number }) {
    const quadraNumero = Math.max(1, Math.min(99, Math.trunc(Number(params.quadraNumero) || 0)));
    if (!quadraNumero) throw new Error("Quadra inválida");

    const torneioRows = await db
      .select({
        id: torneios.id,
        painelQuadrasReservas: torneios.painelQuadrasReservas,
      })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);

    const torneio = torneioRows[0];
    if (!torneio) throw new Error("Torneio não encontrado");

    const atual = this.normalizarReservasQuadras(torneio.painelQuadrasReservas).find((item) => item.quadraNumero === quadraNumero);
    const reservas = this.normalizarReservasQuadras(torneio.painelQuadrasReservas).filter((item) => item.quadraNumero !== quadraNumero);
    if (atual?.proximaPartidaId) {
      reservas.push({
        quadraNumero,
        categoriaId: null,
        fase: null,
        grupoId: null,
        proximaPartidaId: atual.proximaPartidaId,
      });
    }

    await db
      .update(torneios)
      .set({
        painelQuadrasReservas: reservas.length ? (reservas as any) : null,
        atualizadoEm: new Date(),
      })
      .where(eq(torneios.id, params.torneioId));

    return { ok: true };
  }

  async definirProximoJogoQuadra(params: { torneioId: string; quadraNumero: number; partidaId: string }) {
    const quadraNumero = Math.max(1, Math.min(99, Math.trunc(Number(params.quadraNumero) || 0)));
    if (!quadraNumero) throw new Error("Quadra inválida");

    const torneioRows = await db
      .select({
        id: torneios.id,
        quadrasAtivas: torneios.quadrasAtivas,
        painelQuadrasReservas: torneios.painelQuadrasReservas,
      })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);

    const torneio = torneioRows[0];
    if (!torneio) throw new Error("Torneio não encontrado");
    if (quadraNumero > Math.max(0, torneio.quadrasAtivas ?? 0)) throw new Error("Quadra fora da quantidade ativa do painel");

    const partida = await this.buscarPartidaOperacional(params.torneioId, params.partidaId);
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.status !== "AGENDADA") throw new Error("Só é possível definir como próximo um jogo ainda aguardando");
    if ((partida.quadra || "").trim()) throw new Error("Esse jogo já está alocado em uma quadra");

    const configuracoes = this.normalizarReservasQuadras(torneio.painelQuadrasReservas).filter((item) => item.quadraNumero !== quadraNumero);
    const atual = this.normalizarReservasQuadras(torneio.painelQuadrasReservas).find((item) => item.quadraNumero === quadraNumero) ?? null;

    if (temReservaEscopo(atual)) {
      const mesmaChave =
        atual!.categoriaId === partida.categoriaId &&
        atual!.fase === partida.fase &&
        (atual!.grupoId ?? null) === (partida.grupoId ?? null);

      if (!mesmaChave) {
        throw new Error(`A ${nomeQuadra(quadraNumero)} está reservada para outra chave`);
      }
    }

    configuracoes.push({
      quadraNumero,
      categoriaId: atual?.categoriaId ?? null,
      fase: atual?.fase ?? null,
      grupoId: atual?.grupoId ?? null,
      proximaPartidaId: params.partidaId,
    });

    await db
      .update(torneios)
      .set({
        painelQuadrasReservas: configuracoes as any,
        atualizadoEm: new Date(),
      })
      .where(eq(torneios.id, params.torneioId));

    return { ok: true };
  }

  async limparProximoJogoQuadra(params: { torneioId: string; quadraNumero: number }) {
    const quadraNumero = Math.max(1, Math.min(99, Math.trunc(Number(params.quadraNumero) || 0)));
    if (!quadraNumero) throw new Error("Quadra inválida");

    const torneioRows = await db
      .select({
        id: torneios.id,
        painelQuadrasReservas: torneios.painelQuadrasReservas,
      })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);

    const torneio = torneioRows[0];
    if (!torneio) throw new Error("Torneio não encontrado");

    const configuracoes = this.normalizarReservasQuadras(torneio.painelQuadrasReservas)
      .map((item) => (item.quadraNumero === quadraNumero ? { ...item, proximaPartidaId: null } : item))
      .filter((item) => temReservaEscopo(item) || item.proximaPartidaId);

    await db
      .update(torneios)
      .set({
        painelQuadrasReservas: configuracoes.length ? (configuracoes as any) : null,
        atualizadoEm: new Date(),
      })
      .where(eq(torneios.id, params.torneioId));

    return { ok: true };
  }

  private async buscarPartidaOperacional(torneioId: string, partidaId: string) {
    const rows = await db
      .select({
        id: partidas.id,
        categoriaId: partidas.categoriaId,
        fase: partidas.fase,
        grupoId: partidas.grupoId,
        arenaId: partidas.arenaId,
        quadra: partidas.quadra,
        dataHorario: partidas.dataHorario,
        status: partidas.status,
        fotoUrl: partidas.fotoUrl,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneioId)))
      .limit(1);

    return rows[0] ?? null;
  }

  private async validarReservaQuadra(
    torneioId: string,
    quadraNumero: number,
    partida: {
      categoriaId: string;
      fase: string;
      grupoId: string | null;
    }
  ) {
    const torneioRows = await db
      .select({
        painelQuadrasReservas: torneios.painelQuadrasReservas,
      })
      .from(torneios)
      .where(eq(torneios.id, torneioId))
      .limit(1);

    const reserva = this
      .normalizarReservasQuadras(torneioRows[0]?.painelQuadrasReservas)
      .find((item) => item.quadraNumero === quadraNumero);

    if (!reserva) return;
    if (!temReservaEscopo(reserva)) return;

    const mesmaChave =
      reserva.categoriaId === partida.categoriaId &&
      reserva.fase === partida.fase &&
      (reserva.grupoId ?? null) === (partida.grupoId ?? null);

    if (!mesmaChave) {
      throw new Error(`A ${nomeQuadra(quadraNumero)} está reservada para outra chave`);
    }
  }

  private async validarQuadraDisponivel(torneioId: string, quadra: string, partidaIdIgnorado: string, permitirMesmaEmAndamento = false) {
    const conflicts = await db
      .select({
        id: partidas.id,
        status: partidas.status,
      })
      .from(partidas)
      .where(
        and(
          eq(partidas.torneioId, torneioId),
          eq(partidas.quadra, quadra),
          inArray(partidas.status, ACTIVE_MATCH_STATUSES)
        )
      );

    const conflitante = conflicts.find((item) => {
      if (item.id === partidaIdIgnorado) return false;
      if (permitirMesmaEmAndamento && item.status === "AGENDADA") return true;
      return true;
    });

    if (conflitante) {
      throw new Error(`A ${quadra} já possui uma partida em operação`);
    }
  }

  private normalizarReservasQuadras(value: unknown): PainelQuadraReservaConfig[] {
    if (!Array.isArray(value)) return [];
    const normalizadas = value
      .map((item) => {
        const raw = item as Record<string, unknown>;
        const quadraNumero = Math.trunc(Number(raw?.quadraNumero) || 0);
        const categoriaId = typeof raw?.categoriaId === "string" && raw.categoriaId.trim() ? raw.categoriaId.trim() : null;
        const fase = typeof raw?.fase === "string" && raw.fase.trim() ? raw.fase.trim() : null;
        const grupoId = typeof raw?.grupoId === "string" && raw.grupoId.trim() ? raw.grupoId.trim() : null;
        const proximaPartidaId =
          typeof raw?.proximaPartidaId === "string" && raw.proximaPartidaId.trim() ? raw.proximaPartidaId.trim() : null;
        if (!quadraNumero) return null;
        return { quadraNumero, categoriaId, fase, grupoId, proximaPartidaId };
      })
      .filter((item): item is PainelQuadraReservaConfig => Boolean(item))
      .sort((a, b) => a.quadraNumero - b.quadraNumero);

    const porQuadra = new Map<number, PainelQuadraReservaConfig>();
    for (const item of normalizadas) {
      porQuadra.set(item.quadraNumero, item);
    }
    return Array.from(porQuadra.values()).sort((a, b) => a.quadraNumero - b.quadraNumero);
  }
}

export const painelQuadrasService = new PainelQuadrasService();
