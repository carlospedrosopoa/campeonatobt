import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, usuarios } from "@/db/schema";

const STATUS_INSCRICOES_ATIVAS = ["APROVADA", "PENDENTE", "FILA_ESPERA"] as const;

function parseStatuses(value: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return [...STATUS_INSCRICOES_ATIVAS];
  const valid = new Set(["APROVADA", "PENDENTE", "RECUSADA", "FILA_ESPERA"]);
  const statuses = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => valid.has(item));
  return statuses.length > 0 ? statuses : [...STATUS_INSCRICOES_ATIVAS];
}

function toDecimalString(value: any) {
  const raw = value == null ? "" : String(value);
  const trimmed = raw.trim();
  return trimmed || "0";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const { searchParams } = new URL(request.url);
    const statuses = parseStatuses(searchParams.get("status"));

    const rows = await db
      .select({
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaEmail: usuarios.email,
        atletaTelefone: usuarios.telefone,
        inscricaoId: inscricoes.id,
        inscricaoStatus: inscricoes.status,
        categoriaId: categorias.id,
        categoriaNome: categorias.nome,
        categoriaGenero: categorias.genero,
        categoriaValorInscricao: categorias.valorInscricao,
        pagamentoPago: inscricaoPagamentos.pago,
        pagamentoStatus: inscricaoPagamentos.status,
        pagamentoValorDevido: inscricaoPagamentos.valorDevido,
      })
      .from(inscricoes)
      .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
      .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .leftJoin(
        inscricaoPagamentos,
        and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, usuarios.id))
      )
      .where(and(eq(inscricoes.torneioId, torneio.id), inArray(inscricoes.status, statuses as any)))
      .orderBy(asc(usuarios.nome), asc(categorias.nome), asc(inscricoes.dataInscricao));

    const atletas = new Map<
      string,
      {
        atletaId: string;
        nome: string;
        email: string;
        telefone: string | null;
        itens: Array<{
          inscricaoId: string;
          inscricaoStatus: string;
          categoriaId: string;
          categoriaNome: string;
          categoriaGenero: string;
          valor: string;
          pago: boolean;
          pagamentoStatus: string | null;
        }>;
      }
    >();

    for (const r of rows) {
      const atletaId = r.atletaId;
      if (!atletas.has(atletaId)) {
        atletas.set(atletaId, {
          atletaId,
          nome: r.atletaNome,
          email: r.atletaEmail,
          telefone: r.atletaTelefone ?? null,
          itens: [],
        });
      }

      const pago = Boolean(r.pagamentoPago);
      const valor = toDecimalString(r.pagamentoValorDevido ?? r.categoriaValorInscricao);

      atletas.get(atletaId)!.itens.push({
        inscricaoId: r.inscricaoId,
        inscricaoStatus: r.inscricaoStatus,
        categoriaId: r.categoriaId,
        categoriaNome: r.categoriaNome,
        categoriaGenero: r.categoriaGenero,
        valor,
        pago,
        pagamentoStatus: r.pagamentoStatus ?? null,
      });
    }

    const result = Array.from(atletas.values()).map((atleta) => {
      const total = atleta.itens.reduce((acc, item) => acc + Number(item.valor || 0), 0);
      const totalPendente = atleta.itens.reduce((acc, item) => acc + (item.pago ? 0 : Number(item.valor || 0)), 0);
      return {
        ...atleta,
        total: total.toFixed(2),
        totalPendente: totalPendente.toFixed(2),
      };
    });

    return NextResponse.json(
      {
        torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug },
        atletas: result,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

