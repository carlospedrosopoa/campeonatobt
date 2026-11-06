import { NextRequest } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, inscricoes } from "@/db/schema";
import { integracaoAutorizada, naoAutorizado, respostaJson, torneioDaArena } from "@/lib/integracao-carlaobtonline";

const STATUS_COBRAVEIS = ["APROVADA", "PENDENTE"] as const;

/** GET ?pointId= - categorias do torneio, com a contagem de inscricoes aprovadas e pendentes. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ torneioId: string }> }) {
  if (!integracaoAutorizada(request)) return naoAutorizado();

  const { torneioId } = await params;
  const pointId = (new URL(request.url).searchParams.get("pointId") || "").trim();
  const torneio = await torneioDaArena(torneioId, pointId);
  if (!torneio) return respostaJson({ error: "Torneio não encontrado para esta arena" }, 404);

  const lista = await db
    .select({
      id: categorias.id,
      nome: categorias.nome,
      genero: categorias.genero,
      valorInscricao: categorias.valorInscricao,
      totalInscricoes: sql<number>`count(${inscricoes.id})::int`,
    })
    .from(categorias)
    .leftJoin(
      inscricoes,
      and(eq(inscricoes.categoriaId, categorias.id), inArray(inscricoes.status, [...STATUS_COBRAVEIS]))
    )
    .where(eq(categorias.torneioId, torneio.id))
    .groupBy(categorias.id)
    .orderBy(asc(categorias.nome));

  return respostaJson(lista);
}
