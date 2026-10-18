import { db } from "@/db";
import { categorias, equipeIntegrantes, grupos, partidas, presencas, rodadas, smartTorneios, torneios } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { avisarChamadaJogo } from "@/services/aviso-chamada.service";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { dataSP } from "@/services/presenca.service";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { americanoService } from "@/services/americano.service";
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
  /** minutos de aquecimento informados no "Comecou" */
  aquecimentoMin: number | null;
  /** fim do aquecimento (o jogo vale a partir daqui) */
  aquecimentoAte: string | null;
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
  /** chave reservada para esta quadra no Painel de quadras */
  reserva: { descricao: string } | null;
  /** por que nao ha sugestao (ex.: aguardando atletas da chave reservada) */
  aguardando: string | null;
};

type ReservaQuadra = { quadraNumero: number; categoriaId: string | null; fase: string | null; grupoId: string | null; proximaPartidaId: string | null };

/** Reservas de quadra do Painel de quadras (mesmo formato salvo em torneios.painel_quadras_reservas). */
export function normalizarReservas(value: unknown): ReservaQuadra[] {
  if (!Array.isArray(value)) return [];
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return value
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const quadraNumero = Math.trunc(Number(raw.quadraNumero) || 0);
      return quadraNumero
        ? { quadraNumero, categoriaId: texto(raw.categoriaId), fase: texto(raw.fase), grupoId: texto(raw.grupoId), proximaPartidaId: texto(raw.proximaPartidaId) }
        : null;
    })
    .filter((r): r is ReservaQuadra => Boolean(r));
}

/** Jogo pertence a chave reservada (mesma regra do Painel de quadras: categoria, fase e grupo). */
function daChave(l: { categoriaId: string; fase: string; grupoId: string | null }, r: ReservaQuadra) {
  return l.categoriaId === r.categoriaId && l.fase === r.fase && (l.grupoId ?? null) === (r.grupoId ?? null);
}

/** Jogo encerrado ha pouco, para o telao anunciar o resultado. */
export type EncerradoOperacao = {
  id: string;
  quadra: number | null;
  categoriaNome: string;
  wo: boolean;
  vencedora: Atleta[];
  perdedora: Atleta[];
  /** sets do ponto de vista da vencedora, ex.: ["6-3", "6-4"] */
  sets: string[];
  finalizadoEm: string;
};

export type EstadoOperacao = {
  torneio: { id: string; nome: string; quadrasAtivas: number; toleranciaAtrasoMin: number; aquecimentoMin: number; chamadaAutomatica: boolean };
  categoria: { id: string; nome: string } | null;
  categorias: { id: string; nome: string; pendentes: number; encerrados: number; total: number }[];
  quadras: QuadraOperacao[];
  fila: JogoOperacao[];
  progresso: { encerrados: number; total: number };
  encerradosRecentes: EncerradoOperacao[];
  /** chamados sem quadra (ex.: "Chamar" da conferencia de presenca), nas ultimas 2 h */
  chamadosSemQuadra: JogoOperacao[];
  /** hora do servidor, para o telao comparar sem depender do relogio do aparelho */
  agora: string;
  /** categoria ativa no formato Americano: ranking individual ao vivo */
  rankingAmericano: RankingAmericanoOperacao[] | null;
};

export type RankingAmericanoOperacao = {
  posicao: number;
  usuarioId: string;
  nome: string;
  fotoUrl: string | null;
  jogos: number;
  vitorias: number;
  gamesPro: number;
  saldo: number;
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
  async estado(params: { torneioId: string; categoriaId?: string | null; semChamadaAutomatica?: boolean }): Promise<EstadoOperacao> {
    const [torneio] = await db
      .select({
        id: torneios.id,
        nome: torneios.nome,
        chamadaAutomatica: torneios.chamadaAutomatica,
        organizadorId: torneios.organizadorId,
        quadrasAtivas: torneios.quadrasAtivas,
        toleranciaAtrasoMin: torneios.toleranciaAtrasoMin,
        aquecimentoMin: torneios.aquecimentoMin,
        painelQuadrasReservas: torneios.painelQuadrasReservas,
      })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);
    if (!torneio) throw new Error("Torneio não encontrado");

    // Americano: quadra livre sem jogo com os 4 livres remonta os jogos ainda nao chamados
    if (params.categoriaId) {
      await americanoService
        .replanejarSeTravado({ torneioId: params.torneioId, categoriaId: params.categoriaId })
        .catch((e) => console.error("[operacao] falha ao replanejar o americano", e));
    }

    const linhas = await db
      .select({
        id: partidas.id,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        fase: partidas.fase,
        grupoId: partidas.grupoId,
        grupoNome: grupos.nome,
        rodadaNumero: rodadas.numero,
        status: partidas.status,
        quadra: partidas.quadra,
        chamadoEm: partidas.chamadoEm,
        iniciadoEm: partidas.iniciadoEm,
        aquecimentoMin: partidas.aquecimentoMin,
        finalizadoEm: partidas.finalizadoEm,
        dataHorario: partidas.dataHorario,
        vencedorId: partidas.vencedorId,
        detalhesPlacar: partidas.detalhesPlacar,
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
    // reservas do Painel de quadras: quadra reservada so recebe jogos da sua chave, e jogos de chave reservada so vao para ela
    const reservas = normalizarReservas(torneio.painelQuadrasReservas);
    const comEscopo = reservas.filter((r) => r.categoriaId && r.fase);
    const emChaveReservada = (l: { categoriaId: string; fase: string; grupoId: string | null }) => comEscopo.some((r) => daChave(l, r));
    // candidatos: fila da categoria ativa + jogos das chaves reservadas (podem ser de outra categoria)
    // fila: tudo que ainda nao ocupa quadra (jogo chamado sem quadra continua na fila)
    const ocupaQuadra = (l: (typeof linhas)[number]) => Boolean(l.quadra && l.chamadoEm);
    const filaLinhas = linhas
      .filter((l) => l.status === "AGENDADA" && !ocupaQuadra(l) && (l.categoriaId === categoria?.id || emChaveReservada(l)))
      .sort(ordenarFila);

    // encerrados nos ultimos 30 min, com vencedor (o telao anuncia o resultado)
    const limiteRecente = Date.now() - 30 * 60 * 1000;
    const recentes = linhas
      .filter((l) => (l.status === "FINALIZADA" || l.status === "WO") && l.vencedorId && l.finalizadoEm && new Date(l.finalizadoEm).getTime() >= limiteRecente)
      .sort((a, b) => new Date(b.finalizadoEm!).getTime() - new Date(a.finalizadoEm!).getTime())
      .slice(0, 10);

    const limiteChamada = Date.now() - 2 * 60 * 60 * 1000;
    const semQuadraLinhas = linhas.filter(
      (l) => l.status === "AGENDADA" && l.chamadoEm && !l.quadra && new Date(l.chamadoEm).getTime() >= limiteChamada
    );

    const relevantes = [...emQuadra, ...filaLinhas, ...recentes, ...semQuadraLinhas];
    const equipeIds = Array.from(new Set(relevantes.flatMap((l) => [l.equipeAId, l.equipeBId])));
    const atletasMap = equipeIds.length
      ? await equipesDisplayService.mapAtletasEquipes(equipeIds, { categoriaId: Array.from(new Set(relevantes.map((l) => l.categoriaId))) })
      : new Map<string, Atleta[]>();

    // presenca vale a de hoje ou a do dia agendado do jogo (a conferencia de presenca grava no dia do jogo)
    const hoje = dataSP();
    const diaDoJogo = (l: (typeof linhas)[number]) => (l.dataHorario ? dataSP(l.dataHorario) : hoje);
    const dias = Array.from(new Set([hoje, ...relevantes.map(diaDoJogo)]));
    const presentesRows = await db
      .select({ usuarioId: presencas.usuarioId, status: presencas.status, data: presencas.data })
      .from(presencas)
      .where(and(eq(presencas.torneioId, params.torneioId), inArray(presencas.data, dias)));
    const presentesPorDia = new Map<string, Set<string>>();
    for (const p of presentesRows) {
      if (p.status !== "PRESENTE") continue;
      const dia = String(p.data);
      presentesPorDia.set(dia, (presentesPorDia.get(dia) ?? new Set()).add(p.usuarioId));
    }
    // Smart Torneio e criado na hora, com todos no local: nao exige check-in
    const [smart] = await db.select({ id: smartTorneios.id }).from(smartTorneios).where(eq(smartTorneios.torneioId, params.torneioId)).limit(1);
    const estaPresente = (l: (typeof linhas)[number], usuarioId: string) =>
      Boolean(smart) || Boolean(presentesPorDia.get(hoje)?.has(usuarioId) || presentesPorDia.get(diaDoJogo(l))?.has(usuarioId));

    const ocupadosPorJogo = new Map<string, string>(); // atletaId -> partidaId
    for (const l of emQuadra) {
      for (const a of [...(atletasMap.get(l.equipeAId) ?? []), ...(atletasMap.get(l.equipeBId) ?? [])]) ocupadosPorJogo.set(a.id, l.id);
    }

    // Americano: a ordem das rodadas e so referencia. O proximo jogo e o que tem os 4 livres,
    // priorizando quem jogou menos e quem esta parado ha mais tempo (a soma de jogos de cada um nao muda).
    const configCategoria = categoria ? await categoriaConfigService.obterOuDefault(categoria.id).catch(() => null) : null;
    if (categoria && configCategoria?.formato === "AMERICANO") {
      const daCategoria = linhas.filter((l) => l.categoriaId === categoria.id);
      const equipesCat = Array.from(new Set(daCategoria.flatMap((l) => [l.equipeAId, l.equipeBId])));
      const integrantes = equipesCat.length
        ? await db
            .select({ equipeId: equipeIntegrantes.equipeId, usuarioId: equipeIntegrantes.usuarioId })
            .from(equipeIntegrantes)
            .where(inArray(equipeIntegrantes.equipeId, equipesCat))
        : [];
      const membros = new Map<string, string[]>();
      for (const i of integrantes) membros.set(i.equipeId, [...(membros.get(i.equipeId) ?? []), i.usuarioId]);
      const doJogo = (l: (typeof linhas)[number]) => [...(membros.get(l.equipeAId) ?? []), ...(membros.get(l.equipeBId) ?? [])];

      const jogados = new Map<string, number>();
      const ultimoFim = new Map<string, number>(); // quando terminou o ultimo jogo (0 = ainda nao jogou)
      for (const l of daCategoria) {
        const encerrado = l.status === "FINALIZADA" || l.status === "WO";
        const emQuadraAgora = emQuadra.some((q) => q.id === l.id);
        if (!encerrado && !emQuadraAgora) continue;
        for (const u of doJogo(l)) {
          jogados.set(u, (jogados.get(u) ?? 0) + 1);
          const fim = encerrado ? new Date(l.finalizadoEm ?? l.iniciadoEm ?? l.criadoEm).getTime() : Date.now();
          ultimoFim.set(u, Math.max(ultimoFim.get(u) ?? 0, fim));
        }
      }
      const ocupado = (u: string) => ocupadosPorJogo.has(u);
      const chave = (l: (typeof linhas)[number]) => {
        const us = doJogo(l);
        return {
          ocupados: us.filter(ocupado).length,
          jogos: us.reduce((t, u) => t + (jogados.get(u) ?? 0), 0),
          // o menos descansado dos 4 decide: quanto mais cedo ele terminou, melhor
          descanso: Math.max(0, ...us.map((u) => ultimoFim.get(u) ?? 0)),
        };
      };
      const chaves = new Map(filaLinhas.map((l) => [l.id, chave(l)]));
      const ordenados = filaLinhas
        .filter((l) => l.categoriaId === categoria.id)
        .sort((a, b) => {
          if (a.fase !== b.fase) return (ORDEM_FASE[a.fase] ?? 9) - (ORDEM_FASE[b.fase] ?? 9);
          const x = chaves.get(a.id)!;
          const y = chaves.get(b.id)!;
          return x.ocupados - y.ocupados || x.jogos - y.jogos || x.descanso - y.descanso || ordenarFila(a, b);
        });
      const outras = filaLinhas.filter((l) => l.categoriaId !== categoria.id);
      filaLinhas.splice(0, filaLinhas.length, ...ordenados, ...outras);
    }

    const montar = (l: (typeof linhas)[number]): JogoOperacao => {
      const equipeA = atletasMap.get(l.equipeAId) ?? [];
      const equipeB = atletasMap.get(l.equipeBId) ?? [];
      const todos = [...equipeA, ...equipeB];
      const faltando = todos.filter((a) => !estaPresente(l, a.id)).map((a) => a.nome);
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
        aquecimentoMin: l.aquecimentoMin ?? null,
        aquecimentoAte:
          l.iniciadoEm && l.aquecimentoMin ? new Date(new Date(l.iniciadoEm).getTime() + l.aquecimentoMin * 60_000).toISOString() : null,
        equipeA,
        equipeB,
        presentes: todos.length - faltando.length,
        total: todos.length,
        faltando,
        ocupados,
        pronto: todos.length > 0 && faltando.length === 0 && ocupados.length === 0,
      };
    };

    const candidatos = filaLinhas.map(montar);
    const linhaPorId = new Map(filaLinhas.map((l) => [l.id, l]));
    // a lista exibida e so a da categoria em andamento
    const fila = candidatos.filter((j) => j.categoriaId === categoria?.id);
    const descricaoReserva = (r: ReservaQuadra) => {
      const nomeCategoria = categoriasResumo.find((c) => c.id === r.categoriaId)?.nome ?? "Chave";
      const grupo = r.grupoId ? linhas.find((l) => l.grupoId === r.grupoId)?.grupoNome : null;
      return `${nomeCategoria} · ${grupo || NOME_FASE[r.fase ?? ""] || r.fase}`;
    };
    const totalQuadras = Math.max(torneio.quadrasAtivas, ...emQuadra.map((l) => numeroDaQuadra(l.quadra) ?? 0));
    const quadras: QuadraOperacao[] = [];
    const sugeridos = new Set<string>();
    const atletasSugeridos = new Set<string>();
    const livre = (j: JogoOperacao) =>
      j.pronto && !sugeridos.has(j.id) && ![...j.equipeA, ...j.equipeB].some((a) => atletasSugeridos.has(a.id));
    const reservar = (j: JogoOperacao) => {
      sugeridos.add(j.id);
      for (const a of [...j.equipeA, ...j.equipeB]) atletasSugeridos.add(a.id);
    };

    // 1a passada: proximo jogo marcado manualmente no Painel de quadras tem prioridade
    const sugestaoPorQuadra = new Map<number, JogoOperacao>();
    for (let n = 1; n <= totalQuadras; n++) {
      if (emQuadra.some((l) => numeroDaQuadra(l.quadra) === n)) continue;
      const idManual = reservas.find((r) => r.quadraNumero === n)?.proximaPartidaId;
      const manual = idManual ? candidatos.find((j) => j.id === idManual && livre(j)) : undefined;
      if (manual) {
        reservar(manual);
        sugestaoPorQuadra.set(n, manual);
      }
    }

    // 2a passada: chave reservada para a quadra; sem reserva, o proximo pronto da categoria fora das chaves reservadas
    for (let n = 1; n <= totalQuadras; n++) {
      const atual = emQuadra.find((l) => numeroDaQuadra(l.quadra) === n);
      const reserva = comEscopo.find((r) => r.quadraNumero === n) ?? null;
      let sugestao = sugestaoPorQuadra.get(n) ?? null;
      let aguardando: string | null = null;
      if (!atual && !sugestao) {
        const opcoes = reserva
          ? candidatos.filter((j) => daChave(linhaPorId.get(j.id)!, reserva))
          : candidatos.filter((j) => j.categoriaId === categoria?.id && !emChaveReservada(linhaPorId.get(j.id)!));
        sugestao = opcoes.find(livre) ?? null;
        if (sugestao) reservar(sugestao);
        else if (reserva) aguardando = opcoes.length ? `Aguardando atletas da chave ${descricaoReserva(reserva)}` : `Chave ${descricaoReserva(reserva)} sem jogos pendentes`;
      }
      quadras.push({
        numero: n,
        nome: `Quadra ${n}`,
        jogo: atual ? montar(atual) : null,
        sugestao: atual ? null : sugestao,
        reserva: reserva ? { descricao: descricaoReserva(reserva) } : null,
        aguardando,
      });
    }

    const encerradosRecentes: EncerradoOperacao[] = recentes.map((l) => {
      const venceuA = l.vencedorId === l.equipeAId;
      const sets = Array.isArray(l.detalhesPlacar)
        ? (l.detalhesPlacar as { a: number; b: number }[]).map((st) => (venceuA ? `${st.a}-${st.b}` : `${st.b}-${st.a}`))
        : [];
      return {
        id: l.id,
        quadra: numeroDaQuadra(l.quadra),
        categoriaNome: l.categoriaNome,
        wo: l.status === "WO",
        vencedora: atletasMap.get(venceuA ? l.equipeAId : l.equipeBId) ?? [],
        perdedora: atletasMap.get(venceuA ? l.equipeBId : l.equipeAId) ?? [],
        sets,
        finalizadoEm: new Date(l.finalizadoEm!).toISOString(),
      };
    });

    // chamada automatica: quadra livre com jogo sugerido e pronto e chamada sem esperar o operador
    if (torneio.chamadaAutomatica && !params.semChamadaAutomatica && quadras.some((q) => !q.jogo && q.sugestao?.pronto)) {
      const chamados = await chamarSugestoesAutomaticamente({
        torneioId: torneio.id,
        criadoPorId: torneio.organizadorId,
        quadras: quadras.filter((q) => !q.jogo && q.sugestao?.pronto).map((q) => ({ numero: q.numero, partidaId: q.sugestao!.id })),
      });
      if (chamados > 0) return this.estado({ ...params, semChamadaAutomatica: true });
    }

    let rankingAmericano: RankingAmericanoOperacao[] | null = null;
    if (categoria) {
      if (configCategoria?.formato === "AMERICANO") {
        const { linhas: ranking } = await americanoService.ranking(categoria.id);
        rankingAmericano = ranking.map(({ posicao, usuarioId, nome, fotoUrl, jogos, vitorias, gamesPro, saldo }) => ({
          posicao,
          usuarioId,
          nome,
          fotoUrl,
          jogos,
          vitorias,
          gamesPro,
          saldo,
        }));
      }
    }

    return {
      agora: new Date().toISOString(),
      rankingAmericano,
      chamadosSemQuadra: semQuadraLinhas.map(montar),
      encerradosRecentes,
      torneio: {
        id: torneio.id,
        nome: torneio.nome,
        quadrasAtivas: torneio.quadrasAtivas,
        toleranciaAtrasoMin: torneio.toleranciaAtrasoMin,
        aquecimentoMin: torneio.aquecimentoMin,
        chamadaAutomatica: torneio.chamadaAutomatica,
      },
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
      categoriaId: partidas.categoriaId,
      fase: partidas.fase,
      grupoId: partidas.grupoId,
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

  const [cfg] = await db.select({ reservas: torneios.painelQuadrasReservas }).from(torneios).where(eq(torneios.id, params.torneioId)).limit(1);
  const reserva = normalizarReservas(cfg?.reservas).find((r) => r.quadraNumero === n && r.categoriaId && r.fase);
  if (reserva && !daChave(jogo, reserva)) throw new Error(`A quadra ${n} está reservada para outra chave no Painel de quadras`);

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

/**
 * Chamada automatica: chama cada sugestao na sua quadra. Varios aparelhos consultam o estado ao mesmo
 * tempo, entao roda com trava e confere de novo se o jogo ainda nao foi chamado. Retorna quantos chamou.
 */
async function chamarSugestoesAutomaticamente(params: { torneioId: string; criadoPorId: string; quadras: { numero: number; partidaId: string }[] }) {
  const chamados: string[] = [];
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"chamada-automatica:" + params.torneioId}))`);
    for (const q of params.quadras) {
      const [p] = await tx.select({ status: partidas.status, chamadoEm: partidas.chamadoEm }).from(partidas).where(eq(partidas.id, q.partidaId)).limit(1);
      if (!p || p.status !== "AGENDADA" || p.chamadoEm) continue;
      try {
        await chamarJogo({ torneioId: params.torneioId, partidaId: q.partidaId, quadraNumero: q.numero });
        chamados.push(q.partidaId);
      } catch (e) {
        console.error("[operacao] chamada automatica falhou", q, e);
      }
    }
  });
  // aviso no app (e WhatsApp fora do Smart) para os atletas chamados
  for (const partidaId of chamados) {
    const aviso = () => avisarChamadaJogo({ torneioId: params.torneioId, partidaId, criadoPorId: params.criadoPorId });
    try {
      after(aviso);
    } catch {
      void aviso();
    }
  }
  return chamados.length;
}

/** Liga ou desliga a chamada automatica (mesa de controle). */
export async function salvarChamadaAutomatica(params: { torneioId: string; chamadaAutomatica: boolean }) {
  const [t] = await db
    .update(torneios)
    .set({ chamadaAutomatica: Boolean(params.chamadaAutomatica), atualizadoEm: new Date() })
    .where(eq(torneios.id, params.torneioId))
    .returning({ chamadaAutomatica: torneios.chamadaAutomatica });
  return t;
}

/** Marca o inicio do jogo chamado (botao "Comecou" da quadra). */
const limitarAquecimento = (v: unknown) => Math.max(0, Math.min(30, Math.trunc(Number(v) || 0)));

/** Tempo de aquecimento padrao do torneio (mesa de controle). */
export async function salvarAquecimentoPadrao(params: { torneioId: string; aquecimentoMin: number }) {
  const [t] = await db
    .update(torneios)
    .set({ aquecimentoMin: limitarAquecimento(params.aquecimentoMin), atualizadoEm: new Date() })
    .where(eq(torneios.id, params.torneioId))
    .returning({ aquecimentoMin: torneios.aquecimentoMin });
  return t;
}

export async function iniciarJogo(params: { torneioId: string; partidaId: string; aquecimentoMin?: number | null }) {
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
    .set({
      status: "EM_ANDAMENTO",
      iniciadoEm: new Date(),
      aquecimentoMin: params.aquecimentoMin == null ? null : limitarAquecimento(params.aquecimentoMin) || null,
      finalizadoEm: null,
      atualizadoEm: new Date(),
    })
    .where(eq(partidas.id, jogo.id))
    .returning();
  return atualizado;
}

/**
 * Categoria em andamento para quem nao escolhe (pagina publica): a do jogo chamado mais recentemente
 * nas ultimas 3 horas. Sem chamadas, null.
 */
export async function categoriaEmAndamento(torneioId: string): Promise<string | null> {
  const desde = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const [row] = await db
    .select({ categoriaId: partidas.categoriaId })
    .from(partidas)
    .where(and(eq(partidas.torneioId, torneioId), gte(partidas.chamadoEm, desde)))
    .orderBy(desc(partidas.chamadoEm))
    .limit(1);
  return row?.categoriaId ?? null;
}
