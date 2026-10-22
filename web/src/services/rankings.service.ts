import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rankingAtletas, rankingCategorias, rankingLancamentos, rankings, torneios, usuarios } from "@/db/schema";
import { inscricoesService } from "@/services/inscricoes.service";

export class ErroRanking extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export type DadosRanking = { nome: string; descricao?: string | null; janelaMeses: unknown; imagemUrl?: string | null };
export type GeneroRanking = "MASCULINO" | "FEMININO" | "MISTO" | "LIVRE";
export type AtletaPlay = { id: string; nome: string; email: string; telefone?: string | null; fotoUrl?: string | null };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const GENEROS: GeneroRanking[] = ["MASCULINO", "FEMININO", "MISTO", "LIVRE"];

function hojeSP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Primeiro dia que ainda conta no ranking de entrada (pontos dos ultimos `meses` meses). */
export function inicioJanelaEntrada(meses: number, hoje = hojeSP()) {
  const [a, m, d] = hoje.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 - meses, 1));
  // mesmo dia do mes (ou o ultimo, se o mes for mais curto), mais um dia: hoje-12m nao conta mais
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia) + 1);
  return alvo.toISOString().slice(0, 10);
}

function validar(d: DadosRanking) {
  const nome = String(d.nome ?? "").trim();
  if (!nome) throw new ErroRanking("Informe o nome do ranking");
  const janelaMeses = Number(d.janelaMeses);
  if (!Number.isInteger(janelaMeses) || janelaMeses < 1 || janelaMeses > 120) throw new ErroRanking("A janela do ranking de entrada vai de 1 a 120 meses");
  return {
    nome,
    descricao: String(d.descricao ?? "").trim() || null,
    janelaMeses,
    imagemUrl: String(d.imagemUrl ?? "").trim() || null,
  };
}

function pontosValidos(p: unknown) {
  const n = Number(p);
  if (!Number.isInteger(n)) throw new ErroRanking("Pontos precisam ser um número inteiro");
  return n;
}

function dataValida(d: unknown) {
  const s = String(d ?? "").trim();
  if (!s) return hojeSP();
  if (!DATA.test(s)) throw new ErroRanking("Data de referência inválida");
  return s;
}

async function garantirRanking(id: string) {
  const [r] = await db.select({ id: rankings.id }).from(rankings).where(eq(rankings.id, id)).limit(1);
  if (!r) throw new ErroRanking("Ranking não encontrado", 404);
}

async function garantirCategoria(rankingId: string, categoriaId: string) {
  const [c] = await db
    .select({ id: rankingCategorias.id })
    .from(rankingCategorias)
    .where(and(eq(rankingCategorias.id, categoriaId), eq(rankingCategorias.rankingId, rankingId)))
    .limit(1);
  if (!c) throw new ErroRanking("Categoria não encontrada neste ranking", 404);
}

function dadosCategoria(nome: unknown, genero: unknown) {
  const n = String(nome ?? "").trim();
  if (!n) throw new ErroRanking("Informe o nome da categoria");
  const g = String(genero ?? "").trim();
  if (g && !GENEROS.includes(g as GeneroRanking)) throw new ErroRanking("Gênero inválido");
  return { nome: n, genero: (g || null) as GeneroRanking | null };
}

function nomeRepetido(e: unknown) {
  return (e as { code?: string })?.code === "23505";
}

export async function listarRankings() {
  return db
    .select({
      id: rankings.id,
      nome: rankings.nome,
      descricao: rankings.descricao,
      janelaMeses: rankings.janelaMeses,
      imagemUrl: rankings.imagemUrl,
      categorias: sql<number>`(select count(*)::int from ${rankingCategorias} where ${rankingCategorias.rankingId} = ${rankings.id})`,
      atletas: sql<number>`(select count(distinct ${rankingAtletas.usuarioId})::int from ${rankingAtletas} where ${rankingAtletas.rankingId} = ${rankings.id})`,
    })
    .from(rankings)
    .orderBy(asc(rankings.nome));
}

export async function criarRanking(dados: DadosRanking, criadoPorId: string | null) {
  const [r] = await db
    .insert(rankings)
    .values({ ...validar(dados), criadoPorId })
    .returning({ id: rankings.id });
  return r;
}

export async function atualizarRanking(id: string, dados: DadosRanking) {
  await garantirRanking(id);
  await db
    .update(rankings)
    .set({ ...validar(dados), atualizadoEm: new Date() })
    .where(eq(rankings.id, id));
}

export async function excluirRanking(id: string) {
  await garantirRanking(id);
  await db.delete(rankings).where(eq(rankings.id, id));
}

export async function criarCategoria(rankingId: string, nome: unknown, genero: unknown) {
  await garantirRanking(rankingId);
  const dados = dadosCategoria(nome, genero);
  const [{ proxima }] = await db
    .select({ proxima: sql<number>`coalesce(max(${rankingCategorias.ordem}), 0)::int + 1` })
    .from(rankingCategorias)
    .where(eq(rankingCategorias.rankingId, rankingId));
  try {
    const [c] = await db
      .insert(rankingCategorias)
      .values({ rankingId, ...dados, ordem: proxima })
      .returning({ id: rankingCategorias.id });
    return c;
  } catch (e) {
    if (nomeRepetido(e)) throw new ErroRanking("Já existe uma categoria com esse nome");
    throw e;
  }
}

export async function atualizarCategoria(rankingId: string, categoriaId: string, nome: unknown, genero: unknown) {
  await garantirCategoria(rankingId, categoriaId);
  try {
    await db.update(rankingCategorias).set(dadosCategoria(nome, genero)).where(eq(rankingCategorias.id, categoriaId));
  } catch (e) {
    if (nomeRepetido(e)) throw new ErroRanking("Já existe uma categoria com esse nome");
    throw e;
  }
}

/** Remove a categoria com os atletas e pontos dela. */
export async function excluirCategoria(rankingId: string, categoriaId: string) {
  await garantirCategoria(rankingId, categoriaId);
  await db.delete(rankingCategorias).where(eq(rankingCategorias.id, categoriaId));
}

/**
 * Ranking com as categorias. Cada atleta traz o permanente (todos os pontos) e a entrada
 * (pontos com data de referencia dentro da janela); a ordenacao fica com a tela.
 */
export async function detalharRanking(id: string) {
  const [ranking] = await db
    .select({
      id: rankings.id,
      nome: rankings.nome,
      descricao: rankings.descricao,
      janelaMeses: rankings.janelaMeses,
      imagemUrl: rankings.imagemUrl,
    })
    .from(rankings)
    .where(eq(rankings.id, id))
    .limit(1);
  if (!ranking) throw new ErroRanking("Ranking não encontrado", 404);

  const inicioEntrada = inicioJanelaEntrada(ranking.janelaMeses);

  const categorias = await db
    .select({ id: rankingCategorias.id, nome: rankingCategorias.nome, genero: rankingCategorias.genero })
    .from(rankingCategorias)
    .where(eq(rankingCategorias.rankingId, id))
    .orderBy(asc(rankingCategorias.ordem), asc(rankingCategorias.nome));

  const somaDoAtleta = sql`from ${rankingLancamentos} where ${rankingLancamentos.categoriaId} = ${rankingAtletas.categoriaId} and ${rankingLancamentos.usuarioId} = ${rankingAtletas.usuarioId}`;
  const atletas = await db
    .select({
      categoriaId: rankingAtletas.categoriaId,
      usuarioId: rankingAtletas.usuarioId,
      nome: usuarios.nome,
      fotoUrl: usuarios.fotoUrl,
      permanente: sql<number>`coalesce((select sum(${rankingLancamentos.pontos})::int ${somaDoAtleta}), 0)`,
      entrada: sql<number>`coalesce((select sum(${rankingLancamentos.pontos})::int ${somaDoAtleta} and ${rankingLancamentos.dataReferencia} >= ${inicioEntrada}), 0)`,
    })
    .from(rankingAtletas)
    .innerJoin(usuarios, eq(usuarios.id, rankingAtletas.usuarioId))
    .where(eq(rankingAtletas.rankingId, id));

  const lancamentos = await db
    .select({
      id: rankingLancamentos.id,
      categoriaId: rankingLancamentos.categoriaId,
      usuarioId: rankingLancamentos.usuarioId,
      atleta: usuarios.nome,
      tipo: rankingLancamentos.tipo,
      pontos: rankingLancamentos.pontos,
      dataReferencia: rankingLancamentos.dataReferencia,
      observacao: rankingLancamentos.observacao,
      torneio: torneios.nome,
      criadoEm: rankingLancamentos.criadoEm,
    })
    .from(rankingLancamentos)
    .innerJoin(usuarios, eq(usuarios.id, rankingLancamentos.usuarioId))
    .leftJoin(torneios, eq(torneios.id, rankingLancamentos.torneioId))
    .where(eq(rankingLancamentos.rankingId, id))
    .orderBy(desc(rankingLancamentos.dataReferencia), desc(rankingLancamentos.criadoEm));

  return {
    ranking,
    inicioEntrada,
    categorias: categorias.map((c) => ({
      ...c,
      atletas: atletas.filter((a) => a.categoriaId === c.id),
      lancamentos: lancamentos.filter((l) => l.categoriaId === c.id),
    })),
  };
}

/**
 * Inclui um atleta do Play na Quadra numa categoria do ranking. Pontuacao inicial (opcional)
 * vira um lancamento INICIAL, com observacao que a justifica e data de referencia.
 */
export async function adicionarAtleta(params: {
  rankingId: string;
  categoriaId: string;
  atleta: AtletaPlay;
  pontosIniciais?: unknown;
  observacao?: string | null;
  dataReferencia?: unknown;
  criadoPorId: string | null;
}) {
  await garantirCategoria(params.rankingId, params.categoriaId);
  const a = params.atleta;
  if (!a?.id || !a?.nome || !a?.email) throw new ErroRanking("Selecione o atleta pela busca do Play na Quadra");
  const pontos = params.pontosIniciais == null || String(params.pontosIniciais) === "" ? 0 : pontosValidos(params.pontosIniciais);
  const observacao = String(params.observacao ?? "").trim() || null;
  if (pontos !== 0 && !observacao) throw new ErroRanking("Explique a pontuação inicial na observação");
  const dataReferencia = dataValida(params.dataReferencia);

  const usuarioId = await inscricoesService.upsertAtleta({
    nome: a.nome,
    email: a.email,
    telefone: a.telefone ?? undefined,
    playnaquadraAtletaId: a.id,
    fotoUrl: a.fotoUrl ?? undefined,
  });

  await db.transaction(async (tx) => {
    const novo = await tx
      .insert(rankingAtletas)
      .values({ rankingId: params.rankingId, categoriaId: params.categoriaId, usuarioId })
      .onConflictDoNothing()
      .returning({ id: rankingAtletas.id });
    if (novo.length === 0) throw new ErroRanking("Atleta já está nesta categoria");
    if (pontos !== 0) {
      await tx.insert(rankingLancamentos).values({
        rankingId: params.rankingId,
        categoriaId: params.categoriaId,
        usuarioId,
        tipo: "INICIAL",
        pontos,
        dataReferencia,
        observacao,
        criadoPorId: params.criadoPorId,
      });
    }
  });
  return { usuarioId };
}

/** Tira o atleta da categoria junto com os lancamentos dele nela. */
export async function removerAtleta(rankingId: string, categoriaId: string, usuarioId: string) {
  await garantirCategoria(rankingId, categoriaId);
  await db.transaction(async (tx) => {
    await tx.delete(rankingLancamentos).where(and(eq(rankingLancamentos.categoriaId, categoriaId), eq(rankingLancamentos.usuarioId, usuarioId)));
    await tx.delete(rankingAtletas).where(and(eq(rankingAtletas.categoriaId, categoriaId), eq(rankingAtletas.usuarioId, usuarioId)));
  });
}

/** Ajuste manual (positivo ou negativo), sempre com observacao. */
export async function lancarPontos(params: {
  rankingId: string;
  categoriaId: string;
  usuarioId: string;
  pontos: unknown;
  observacao: string;
  dataReferencia?: unknown;
  criadoPorId: string | null;
}) {
  const pontos = pontosValidos(params.pontos);
  if (pontos === 0) throw new ErroRanking("Informe os pontos (podem ser negativos)");
  const observacao = String(params.observacao ?? "").trim();
  if (!observacao) throw new ErroRanking("Explique o lançamento na observação");
  const dataReferencia = dataValida(params.dataReferencia);
  const [participa] = await db
    .select({ id: rankingAtletas.id })
    .from(rankingAtletas)
    .where(
      and(
        eq(rankingAtletas.rankingId, params.rankingId),
        eq(rankingAtletas.categoriaId, params.categoriaId),
        eq(rankingAtletas.usuarioId, params.usuarioId)
      )
    )
    .limit(1);
  if (!participa) throw new ErroRanking("Atleta não faz parte desta categoria");
  await db.insert(rankingLancamentos).values({
    rankingId: params.rankingId,
    categoriaId: params.categoriaId,
    usuarioId: params.usuarioId,
    tipo: "MANUAL",
    pontos,
    dataReferencia,
    observacao,
    criadoPorId: params.criadoPorId,
  });
}

export async function excluirLancamento(rankingId: string, lancamentoId: string) {
  await db.delete(rankingLancamentos).where(and(eq(rankingLancamentos.rankingId, rankingId), eq(rankingLancamentos.id, lancamentoId)));
}
