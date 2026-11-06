import { NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { torneios } from "@/db/schema";
import { integracaoAutorizada, naoAutorizado, respostaJson } from "@/lib/integracao-carlaobtonline";

const STATUS_VALIDOS = ["RASCUNHO", "ABERTO", "EM_ANDAMENTO", "FINALIZADO", "CANCELADO"] as const;
type StatusTorneio = (typeof STATUS_VALIDOS)[number];

/** GET ?pointId=&status=ABERTO,EM_ANDAMENTO - torneios que tem a arena como sede. */
export async function GET(request: NextRequest) {
  if (!integracaoAutorizada(request)) return naoAutorizado();

  const { searchParams } = new URL(request.url);
  const pointId = (searchParams.get("pointId") || "").trim();
  if (!pointId) return respostaJson({ error: "pointId é obrigatório" }, 400);

  const pedidos = (searchParams.get("status") || "ABERTO,EM_ANDAMENTO")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is StatusTorneio => (STATUS_VALIDOS as readonly string[]).includes(s));
  const status: StatusTorneio[] = pedidos.length > 0 ? pedidos : ["ABERTO", "EM_ANDAMENTO"];

  const lista = await db
    .select({
      id: torneios.id,
      slug: torneios.slug,
      nome: torneios.nome,
      dataInicio: torneios.dataInicio,
      dataFim: torneios.dataFim,
      status: torneios.status,
    })
    .from(torneios)
    .where(and(eq(torneios.pointIdSede, pointId), inArray(torneios.status, status)))
    .orderBy(desc(torneios.dataInicio));

  return respostaJson(lista);
}
