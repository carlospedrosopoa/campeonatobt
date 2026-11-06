import { NextRequest } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categorias, equipeIntegrantes, inscricaoPagamentos, inscricoes, usuarios } from "@/db/schema";
import { integracaoAutorizada, naoAutorizado, respostaJson, torneioDaArena } from "@/lib/integracao-carlaobtonline";

// Status que podem virar comanda no Play na Quadra (fila de espera e recusada ficam de fora)
const STATUS_COBRAVEIS = ["APROVADA", "PENDENTE"] as const;

function valorDecimal(value: unknown) {
  const n = Number(value == null ? 0 : String(value).trim() || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/**
 * GET ?pointId=&categoriaId= - uma linha por atleta inscrito (a dupla gera duas cobrancas).
 * valor = valorDevido do atleta ou, sem ele, o valor da categoria (mesma regra da tela de cobranca).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ torneioId: string }> }) {
  if (!integracaoAutorizada(request)) return naoAutorizado();

  const { torneioId } = await params;
  const { searchParams } = new URL(request.url);
  const pointId = (searchParams.get("pointId") || "").trim();
  const categoriaId = (searchParams.get("categoriaId") || "").trim();
  const inscricaoIdsParam = (searchParams.get("inscricaoIds") || "").trim();

  const torneio = await torneioDaArena(torneioId, pointId);
  if (!torneio) return respostaJson({ error: "Torneio não encontrado para esta arena" }, 404);

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const inscricaoIds = inscricaoIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => uuid.test(s));

  const filtros = [eq(inscricoes.torneioId, torneio.id), inArray(inscricoes.status, [...STATUS_COBRAVEIS])];
  if (categoriaId && uuid.test(categoriaId)) filtros.push(eq(inscricoes.categoriaId, categoriaId));
  if (inscricaoIds.length > 0) filtros.push(inArray(inscricoes.id, inscricaoIds));

  const rows = await db
    .select({
      inscricaoId: inscricoes.id,
      inscricaoStatus: inscricoes.status,
      dataInscricao: inscricoes.dataInscricao,
      equipeId: inscricoes.equipeId,
      categoriaId: categorias.id,
      categoriaNome: categorias.nome,
      categoriaValor: categorias.valorInscricao,
      atletaId: usuarios.id,
      atletaNome: usuarios.nome,
      atletaEmail: usuarios.email,
      atletaTelefone: usuarios.telefone,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      valorDevido: inscricaoPagamentos.valorDevido,
      pago: inscricaoPagamentos.pago,
      pagamentoStatus: inscricaoPagamentos.status,
    })
    .from(inscricoes)
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
    .leftJoin(
      inscricaoPagamentos,
      and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, usuarios.id))
    )
    .where(and(...filtros))
    .orderBy(asc(categorias.nome), asc(inscricoes.dataInscricao), asc(usuarios.nome));

  // Nome da dupla: integrantes de cada equipe, na ordem da consulta
  const integrantesPorEquipe = new Map<string, string[]>();
  for (const r of rows) {
    const nomes = integrantesPorEquipe.get(r.equipeId) ?? [];
    if (!nomes.includes(r.atletaNome)) nomes.push(r.atletaNome);
    integrantesPorEquipe.set(r.equipeId, nomes);
  }

  const lista = rows.map((r) => ({
    inscricaoId: r.inscricaoId,
    inscricaoStatus: r.inscricaoStatus,
    dataInscricao: r.dataInscricao,
    categoria: { id: r.categoriaId, nome: r.categoriaNome },
    dupla: (integrantesPorEquipe.get(r.equipeId) ?? []).join(" / "),
    atleta: {
      id: r.atletaId,
      nome: r.atletaNome,
      email: r.atletaEmail,
      telefone: r.atletaTelefone ?? null,
      playnaquadraAtletaId: r.playnaquadraAtletaId ?? null,
    },
    valor: valorDecimal(r.valorDevido ?? r.categoriaValor),
    pago: Boolean(r.pago),
    pagamentoStatus: r.pagamentoStatus ?? null,
  }));

  return respostaJson({ torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug }, inscricoes: lista });
}
