import { db } from "@/db";
import { arenas, categorias, grupos, partidas, torneios } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

const ACTIVE_MATCH_STATUSES = ["AGENDADA", "EM_ANDAMENTO"] as const;

type ActiveStatus = (typeof ACTIVE_MATCH_STATUSES)[number];

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
};

type QuadraCard = {
  numero: number;
  nome: string;
  partidaAtual: PainelQuadrasPartida | null;
};

function nomeQuadra(numero: number) {
  return `Quadra ${numero}`;
}

function isActiveStatus(status: string): status is ActiveStatus {
  return ACTIVE_MATCH_STATUSES.includes(status as ActiveStatus);
}

function ordemStatus(status: string) {
  if (status === "EM_ANDAMENTO") return 0;
  if (status === "AGENDADA") return 1;
  return 2;
}

export class PainelQuadrasService {
  async listar(torneioId: string) {
    const torneioRows = await db
      .select({
        id: torneios.id,
        nome: torneios.nome,
        slug: torneios.slug,
        quadrasAtivas: torneios.quadrasAtivas,
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

    const partidasComNomes: PainelQuadrasPartida[] = rows.map((row) => ({
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
    }));

    const quadrasAtivas = Math.max(0, torneio.quadrasAtivas ?? 0);
    const quadrasMap = new Map<string, QuadraCard>();
    const courtNames = new Set<string>();
    for (let i = 1; i <= quadrasAtivas; i += 1) {
      const nome = nomeQuadra(i);
      courtNames.add(nome);
      quadrasMap.set(nome, {
        numero: i,
        nome,
        partidaAtual: null,
      });
    }

    const activeAssignedMatches = partidasComNomes
      .filter((partida) => Boolean(partida.quadra) && isActiveStatus(partida.status))
      .slice()
      .sort((a, b) => ordemStatus(a.status) - ordemStatus(b.status));

    for (const partida of activeAssignedMatches) {
      const quadra = (partida.quadra || "").trim();
      if (!courtNames.has(quadra)) continue;
      const current = quadrasMap.get(quadra);
      if (!current || current.partidaAtual) continue;
      current.partidaAtual = partida;
    }

    const fila = partidasComNomes.filter((partida) => {
      if (partida.status !== "AGENDADA") return false;
      const quadra = (partida.quadra || "").trim();
      return !quadra || !courtNames.has(quadra);
    });

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

    const [updated] = await db
      .update(torneios)
      .set({
        quadrasAtivas,
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

    await this.validarQuadraDisponivel(params.torneioId, quadra, params.partidaId);

    const [updated] = await db
      .update(partidas)
      .set({
        quadra,
        arenaId: params.arenaId ?? null,
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, params.partidaId))
      .returning();

    return updated;
  }

  async retirarDaQuadra(params: { torneioId: string; partidaId: string }) {
    const partida = await this.buscarPartidaOperacional(params.torneioId, params.partidaId);
    if (!partida) throw new Error("Partida não encontrada");
    if (partida.status !== "AGENDADA") throw new Error("Só é possível retirar da quadra partidas ainda não iniciadas");

    const [updated] = await db
      .update(partidas)
      .set({
        quadra: null,
        arenaId: null,
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, params.partidaId))
      .returning();

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

  private async buscarPartidaOperacional(torneioId: string, partidaId: string) {
    const rows = await db
      .select({
        id: partidas.id,
        quadra: partidas.quadra,
        status: partidas.status,
      })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneioId)))
      .limit(1);

    return rows[0] ?? null;
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
}

export const painelQuadrasService = new PainelQuadrasService();
