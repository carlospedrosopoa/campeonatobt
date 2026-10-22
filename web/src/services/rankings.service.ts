import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rankingAtletas, rankingLancamentos, rankings, torneios, usuarios } from "@/db/schema";
import { inscricoesService } from "@/services/inscricoes.service";

export class ErroRanking extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export type DadosRanking = {
  nome: string;
  descricao?: string | null;
  dataInicio: string;
  dataFim: string;
  imagemUrl?: string | null;
};

export type AtletaPlay = { id: string; nome: string; email: string; telefone?: string | null; fotoUrl?: string | null };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function validar(d: DadosRanking) {
  const nome = String(d.nome ?? "").trim();
  if (!nome) throw new ErroRanking("Informe o nome do ranking");
  if (!DATA.test(String(d.dataInicio)) || !DATA.test(String(d.dataFim))) throw new ErroRanking("Informe o período (início e fim)");
  if (d.dataFim < d.dataInicio) throw new ErroRanking("O fim do período precisa ser depois do início");
  return {
    nome,
    descricao: String(d.descricao ?? "").trim() || null,
    dataInicio: d.dataInicio,
    dataFim: d.dataFim,
    imagemUrl: String(d.imagemUrl ?? "").trim() || null,
  };
}

function pontosValidos(p: unknown) {
  const n = Number(p);
  if (!Number.isInteger(n)) throw new ErroRanking("Pontos precisam ser um número inteiro");
  return n;
}

async function garantirRanking(id: string) {
  const [r] = await db.select({ id: rankings.id }).from(rankings).where(eq(rankings.id, id)).limit(1);
  if (!r) throw new ErroRanking("Ranking não encontrado", 404);
}

/** Lista com contagem de atletas; os em andamento primeiro. */
export async function listarRankings() {
  return db
    .select({
      id: rankings.id,
      nome: rankings.nome,
      descricao: rankings.descricao,
      dataInicio: rankings.dataInicio,
      dataFim: rankings.dataFim,
      imagemUrl: rankings.imagemUrl,
      atletas: sql<number>`(select count(*)::int from ${rankingAtletas} where ${rankingAtletas.rankingId} = ${rankings.id})`,
    })
    .from(rankings)
    .orderBy(desc(rankings.dataFim), asc(rankings.nome));
}

export async function criarRanking(dados: DadosRanking, criadoPorId: string | null) {
  const v = validar(dados);
  const [r] = await db
    .insert(rankings)
    .values({ ...v, criadoPorId })
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

/** Ranking com a classificacao (soma dos lancamentos; empate por nome) e o extrato de lancamentos. */
export async function detalharRanking(id: string) {
  const [ranking] = await db.select().from(rankings).where(eq(rankings.id, id)).limit(1);
  if (!ranking) throw new ErroRanking("Ranking não encontrado", 404);

  const atletas = await db
    .select({
      usuarioId: rankingAtletas.usuarioId,
      nome: usuarios.nome,
      fotoUrl: usuarios.fotoUrl,
      pontos: sql<number>`coalesce((select sum(${rankingLancamentos.pontos})::int from ${rankingLancamentos} where ${rankingLancamentos.rankingId} = ${rankingAtletas.rankingId} and ${rankingLancamentos.usuarioId} = ${rankingAtletas.usuarioId}), 0)`,
    })
    .from(rankingAtletas)
    .innerJoin(usuarios, eq(usuarios.id, rankingAtletas.usuarioId))
    .where(eq(rankingAtletas.rankingId, id));

  atletas.sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt-BR"));
  let posicao = 0;
  const classificacao = atletas.map((a, i) => {
    if (i === 0 || a.pontos !== atletas[i - 1].pontos) posicao = i + 1;
    return { ...a, posicao };
  });

  const lancamentos = await db
    .select({
      id: rankingLancamentos.id,
      usuarioId: rankingLancamentos.usuarioId,
      atleta: usuarios.nome,
      tipo: rankingLancamentos.tipo,
      pontos: rankingLancamentos.pontos,
      observacao: rankingLancamentos.observacao,
      torneio: torneios.nome,
      criadoEm: rankingLancamentos.criadoEm,
    })
    .from(rankingLancamentos)
    .innerJoin(usuarios, eq(usuarios.id, rankingLancamentos.usuarioId))
    .leftJoin(torneios, eq(torneios.id, rankingLancamentos.torneioId))
    .where(eq(rankingLancamentos.rankingId, id))
    .orderBy(desc(rankingLancamentos.criadoEm));

  return { ranking, classificacao, lancamentos };
}

/**
 * Inclui um atleta do Play na Quadra no ranking. Pontuacao inicial (opcional) vira um lancamento
 * INICIAL com a observacao que a justifica.
 */
export async function adicionarAtleta(params: {
  rankingId: string;
  atleta: AtletaPlay;
  pontosIniciais?: number | null;
  observacao?: string | null;
  criadoPorId: string | null;
}) {
  await garantirRanking(params.rankingId);
  const a = params.atleta;
  if (!a?.id || !a?.nome || !a?.email) throw new ErroRanking("Selecione o atleta pela busca do Play na Quadra");
  const pontos = params.pontosIniciais == null || String(params.pontosIniciais) === "" ? 0 : pontosValidos(params.pontosIniciais);
  const observacao = String(params.observacao ?? "").trim() || null;
  if (pontos !== 0 && !observacao) throw new ErroRanking("Explique a pontuação inicial na observação");

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
      .values({ rankingId: params.rankingId, usuarioId })
      .onConflictDoNothing()
      .returning({ id: rankingAtletas.id });
    if (novo.length === 0) throw new ErroRanking("Atleta já está neste ranking");
    if (pontos !== 0) {
      await tx.insert(rankingLancamentos).values({
        rankingId: params.rankingId,
        usuarioId,
        tipo: "INICIAL",
        pontos,
        observacao,
        criadoPorId: params.criadoPorId,
      });
    }
  });
  return { usuarioId };
}

/** Tira o atleta do ranking junto com os lancamentos dele. */
export async function removerAtleta(rankingId: string, usuarioId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(rankingLancamentos).where(and(eq(rankingLancamentos.rankingId, rankingId), eq(rankingLancamentos.usuarioId, usuarioId)));
    await tx.delete(rankingAtletas).where(and(eq(rankingAtletas.rankingId, rankingId), eq(rankingAtletas.usuarioId, usuarioId)));
  });
}

/** Ajuste manual (positivo ou negativo), sempre com observacao. */
export async function lancarPontos(params: { rankingId: string; usuarioId: string; pontos: unknown; observacao: string; criadoPorId: string | null }) {
  const pontos = pontosValidos(params.pontos);
  if (pontos === 0) throw new ErroRanking("Informe os pontos (podem ser negativos)");
  const observacao = String(params.observacao ?? "").trim();
  if (!observacao) throw new ErroRanking("Explique o lançamento na observação");
  const [participa] = await db
    .select({ id: rankingAtletas.id })
    .from(rankingAtletas)
    .where(and(eq(rankingAtletas.rankingId, params.rankingId), eq(rankingAtletas.usuarioId, params.usuarioId)))
    .limit(1);
  if (!participa) throw new ErroRanking("Atleta não faz parte deste ranking");
  await db.insert(rankingLancamentos).values({
    rankingId: params.rankingId,
    usuarioId: params.usuarioId,
    tipo: "MANUAL",
    pontos,
    observacao,
    criadoPorId: params.criadoPorId,
  });
}

export async function excluirLancamento(rankingId: string, lancamentoId: string) {
  await db.delete(rankingLancamentos).where(and(eq(rankingLancamentos.rankingId, rankingId), eq(rankingLancamentos.id, lancamentoId)));
}
