import { db } from "@/db";
import { categorias, grupos, partidas, presencas, rodadas, torneios } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { dataSP } from "@/services/presenca.service";
import { deveInvalidarCardPartida, excluirCardPartidaDoGcs } from "@/services/partida-card-cache.service";

/**
 * Operacao do torneio no dia (fase 1 do torneio "autonomo"): uma categoria por vez.
 * A fila segue a ordem da chave; o sistema sugere o proximo jogo para cada quadra livre
 * (os 4 atletas presentes hoje e nenhum deles ocupado em outra quadra) e o arbitro confirma a chamada.
 */

const ORDEM_FASE: Record<string, number> = { GRUPOS: 0, OITAVAS: 1, QUARTAS: 2, SEMI: 3, TERCEIRO_LUGAR: 4, FINAL: 5 };

export const NOME_FASE: Record<string, string> = {
  GRUPOS: "Fase de grupos",
  OITAVAS: "Oitavas de final",
  QUARTAS: "Quartas de final",
  SEMI: "Semifinal",
  TERCEIRO_LUGAR: "Disputa de 3º lugar",
  FINAL: "Final",
};

type Atleta = { id: string; nome: string; fotoUrl?: string | null };

export type JogoOperacao = {
  id: string;
  categoriaId: string;
  categoriaNome: string;
  fase: string;
  faseNome: string;
  grupoNome: string | null;
  rodadaNumero: number | null;
  status: string;
  quadra: string | null;
  chamadoEm: string | null;
  iniciadoEm: string | null;
  equipeA: Atleta[];
  equipeB: Atleta[];
  presentes: number;
  total: number;
  faltando: string[];
  /** algum atleta esta em outro jogo ja chamado ou em andamento */
  ocupados: string[];
  pronto: boolean;
};

export type QuadraOperacao = {
  numero: number;
  nome: string;
  jogo: JogoOperacao | null;
  /** sugestao do proximo jogo quando a quadra esta livre */
  sugestao: JogoOperacao | null;
};

export type EstadoOperacao = {
  torneio: { id: string; nome: string; quadrasAtivas: number; toleranciaAtrasoMin: number };
  categoria: { id: string; nome: string } | null;
  categorias: { id: string; nome: string; pendentes: number; encerrados: number; total: number }[];
  quadras: QuadraOperacao[];
  fila: JogoOperacao[];
  progresso: { encerrados: number; total: number };
};

const numeroDaQuadra = (quadra: string | null) => {
  const m = quadra?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

function ordenarFila(a: { fase: string; rodadaNumero: number | null; grupoNome: string | null; criadoEm: Date }, b: typeof a) {
  return (
    (ORDEM_FASE[a.fase] ?? 9) - (ORDEM_FASE[b.fase] ?? 9) ||
    (a.rodadaNumero ?? 0) - (b.rodadaNumero ?? 0) ||
    (a.grupoNome ?? "").localeCompare(b.grupoNome ?? "") ||
    a.criadoEm.getTime() - b.criadoEm.getTime()
  );
}

export class OperacaoService {
  async estado(params: { torneioId: string; categoriaId?: string | null }): Promise<EstadoOperacao> {
    const [torneio] = await db
      .select({ id: torneios.id, nome: torneios.nome, quadrasAtivas: torneios.quadrasAtivas, toleranciaAtrasoMin: torneios.toleranciaAtrasoMin })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);
    if (!torneio) throw new Error("Torneio não encontrado");

    const linhas = await db
      .select({
        id: partidas.id,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        fase: partidas.fase,
        grupoNome: grupos.nome,
        rodadaNumero: rodadas.numero,
        status: partidas.status,
        quadra: partidas.quadra,
        chamadoEm: partidas.chamadoEm,
        iniciadoEm: partidas.iniciadoEm,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        criadoEm: partidas.criadoEm,
      })
      .from(partidas)
      .innerJoin(categorias, eq(categorias.id, partidas.categoriaId))
      .leftJoin(grupos, eq(grupos.id, partidas.grupoId))
      .leftJoin(rodadas, eq(rodadas.id, partidas.rodadaId))
      .where(eq(partidas.torneioId, params.torneioId))
      .orderBy(asc(partidas.criadoEm));

    // resumo por categoria (para escolher qual roda agora)
    const porCategoria = new Map<string, { id: string; nome: string; pendentes: number; encerrados: number; total: number }>();
    for (const l of linhas) {
      const c = porCategoria.get(l.categoriaId) ?? { id: l.categoriaId, nome: l.categoriaNome, pendentes: 0, encerrados: 0, total: 0 };
      c.total += 1;
      if (l.status === "FINALIZADA" || l.status === "WO") c.encerrados += 1;
      else if (l.status !== "CANCELADA") c.pendentes += 1;
      porCategoria.set(l.categoriaId, c);
    }
    const categoriasResumo = Array.from(porCategoria.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const categoria = params.categoriaId ? categoriasResumo.find((c) => c.id === params.categoriaId) ?? null : null;

    // jogos que ocupam quadra agora (de qualquer categoria) e os da fila da categoria ativa
    // ocupa quadra quem foi chamado ou esta jogando; quadra preenchida so pelo agendamento nao conta
    const emQuadra = linhas.filter((l) => l.quadra && (l.status === "EM_ANDAMENTO" || (l.status === "AGENDADA" && l.chamadoEm)));
    const filaLinhas = categoria
      ? linhas.filter((l) => l.categoriaId === categoria.id && l.status === "AGENDADA" && !l.chamadoEm).sort(ordenarFila)
      : [];

    const relevantes = [...emQuadra, ...filaLinhas];
    const equipeIds = Array.from(new Set(relevantes.flatMap((l) => [l.equipeAId, l.equipeBId])));
    const atletasMap = equipeIds.length
      ? await equipesDisplayService.mapAtletasEquipes(equipeIds, { categoriaId: Array.from(new Set(relevantes.map((l) => l.categoriaId))) })
      : new Map<string, Atleta[]>();

    // presenca e de hoje: a operacao acontece no dia
    const hoje = dataSP();
    const presentesRows = await db
      .select({ usuarioId: presencas.usuarioId, status: presencas.status })
      .from(presencas)
      .where(and(eq(presencas.torneioId, params.torneioId), eq(presencas.data, hoje)));
    const presentes = new Set(presentesRows.filter((p) => p.status === "PRESENTE").map((p) => p.usuarioId));

    const ocupadosPorJogo = new Map<string, string>(); // atletaId -> partidaId
    for (const l of emQuadra) {
      for (const a of [...(atletasMap.get(l.equipeAId) ?? []), ...(atletasMap.get(l.equipeBId) ?? [])]) ocupadosPorJogo.set(a.id, l.id);
    }

    const montar = (l: (typeof linhas)[number]): JogoOperacao => {
      const equipeA = atletasMap.get(l.equipeAId) ?? [];
      const equipeB = atletasMap.get(l.equipeBId) ?? [];
      const todos = [...equipeA, ...equipeB];
      const faltando = todos.filter((a) => !presentes.has(a.id)).map((a) => a.nome);
      const ocupados = todos.filter((a) => ocupadosPorJogo.has(a.id) && ocupadosPorJogo.get(a.id) !== l.id).map((a) => a.nome);
      return {
        id: l.id,
        categoriaId: l.categoriaId,
        categoriaNome: l.categoriaNome,
        fase: l.fase,
        faseNome: NOME_FASE[l.fase] ?? l.fase,
        grupoNome: l.grupoNome ?? null,
        rodadaNumero: l.rodadaNumero ?? null,
        status: l.status,
        quadra: l.quadra ?? null,
        chamadoEm: l.chamadoEm ? new Date(l.chamadoEm).toISOString() : null,
        iniciadoEm: l.iniciadoEm ? new Date(l.iniciadoEm).toISOString() : null,
        equipeA,
        equipeB,
        presentes: todos.length - faltando.length,
        total: todos.length,
        faltando,
        ocupados,
        pronto: todos.length > 0 && faltando.length === 0 && ocupados.length === 0,
      };
    };

    const fila = filaLinhas.map(montar);
    const totalQuadras = Math.max(torneio.quadrasAtivas, ...emQuadra.map((l) => numeroDaQuadra(l.quadra) ?? 0));
    const quadras: QuadraOperacao[] = [];
    const sugeridos = new Set<string>();
    const atletasSugeridos = new Set<string>();
    for (let n = 1; n <= totalQuadras; n++) {
      const atual = emQuadra.find((l) => numeroDaQuadra(l.quadra) === n);
      let sugestao: JogoOperacao | null = null;
      if (!atual) {
        // proximo jogo pronto da fila, sem repetir atleta ja sugerido para outra quadra
        sugestao =
          fila.find(
            (j) => j.pronto && !sugeridos.has(j.id) && ![...j.equipeA, ...j.equipeB].some((a) => atletasSugeridos.has(a.id))
          ) ?? null;
        if (sugestao) {
          sugeridos.add(sugestao.id);
          for (const a of [...sugestao.equipeA, ...sugestao.equipeB]) atletasSugeridos.add(a.id);
        }
      }
      quadras.push({ numero: n, nome: `Quadra ${n}`, jogo: atual ? montar(atual) : null, sugestao });
    }

    return {
      torneio: { id: torneio.id, nome: torneio.nome, quadrasAtivas: torneio.quadrasAtivas, toleranciaAtrasoMin: torneio.toleranciaAtrasoMin },
      categoria: categoria ? { id: categoria.id, nome: categoria.nome } : null,
      categorias: categoriasResumo,
      quadras,
      fila,
      progresso: categoria ? { encerrados: categoria.encerrados, total: categoria.total } : { encerrados: 0, total: 0 },
    };
  }
}

export const operacaoService = new OperacaoService();

/**
 * Chama o jogo para a quadra: grava "Quadra N" e a hora da chamada.
 * Diferente do painel de quadras, so considera ocupada a quadra com jogo chamado ou em andamento:
 * quadra preenchida apenas pelo agendamento nao bloqueia a chamada.
 */
export async function chamarJogo(params: { torneioId: string; partidaId: string; quadraNumero: number }) {
  const n = Math.trunc(Number(params.quadraNumero));
  if (!n || n < 1 || n > 99) throw new Error("Quadra inválida");
  const [jogo] = await db
    .select({
      id: partidas.id,
      status: partidas.status,
      chamadoEm: partidas.chamadoEm,
      quadra: partidas.quadra,
      arenaId: partidas.arenaId,
      dataHorario: partidas.dataHorario,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
      fotoUrl: partidas.fotoUrl,
    })
    .from(partidas)
    .where(and(eq(partidas.id, params.partidaId), eq(partidas.torneioId, params.torneioId)))
    .limit(1);
  if (!jogo) throw new Error("Jogo não encontrado");
  if (jogo.status !== "AGENDADA") throw new Error("Este jogo já começou ou foi encerrado");

  const ativos = await db
    .select({ id: partidas.id, quadra: partidas.quadra, status: partidas.status, chamadoEm: partidas.chamadoEm })
    .from(partidas)
    .where(and(eq(partidas.torneioId, params.torneioId), inArray(partidas.status, ["AGENDADA", "EM_ANDAMENTO"])));
  const ocupante = ativos.find(
    (p) => p.id !== jogo.id && numeroDaQuadra(p.quadra) === n && (p.status === "EM_ANDAMENTO" || p.chamadoEm)
  );
  if (ocupante) throw new Error(`A quadra ${n} já tem um jogo chamado ou em andamento`);

  const quadra = `Quadra ${n}`;
  const invalidarCard = deveInvalidarCardPartida(jogo, {
    dataHorario: jogo.dataHorario,
    arenaId: jogo.arenaId,
    quadra,
    equipeAId: jogo.equipeAId,
    equipeBId: jogo.equipeBId,
  });
  const [atualizado] = await db
    .update(partidas)
    .set({ quadra, chamadoEm: new Date(), ...(invalidarCard ? { fotoUrl: null } : {}), atualizadoEm: new Date() })
    .where(eq(partidas.id, jogo.id))
    .returning();
  if (invalidarCard) await excluirCardPartidaDoGcs(jogo.fotoUrl).catch(() => null);
  return atualizado;
}

/** Marca o inicio do jogo chamado (botao "Comecou" da quadra). */
export async function iniciarJogo(params: { torneioId: string; partidaId: string }) {
  const [jogo] = await db
    .select({ id: partidas.id, status: partidas.status, chamadoEm: partidas.chamadoEm, quadra: partidas.quadra })
    .from(partidas)
    .where(and(eq(partidas.id, params.partidaId), eq(partidas.torneioId, params.torneioId)))
    .limit(1);
  if (!jogo) throw new Error("Jogo não encontrado");
  if (jogo.status !== "AGENDADA") throw new Error("Este jogo já começou ou foi encerrado");
  if (!jogo.chamadoEm || !jogo.quadra) throw new Error("Chame o jogo para uma quadra antes de iniciar");
  const [atualizado] = await db
    .update(partidas)
    .set({ status: "EM_ANDAMENTO", iniciadoEm: new Date(), finalizadoEm: null, atualizadoEm: new Date() })
    .where(eq(partidas.id, jogo.id))
    .returning();
  return atualizado;
}
