import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { equipeIntegrantes, inscricaoPagamentos, inscricoes, torneios } from "@/db/schema";
import { integracaoAutorizada, naoAutorizado, respostaJson } from "@/lib/integracao-carlaobtonline";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST { pointId, pago, itens: [{ inscricaoId, atletaId }] }
 * O Play na Quadra avisa que a comanda da inscricao foi quitada (pago=true) ou reaberta (pago=false).
 * Mesmo efeito da caixinha de pagamento da tela de inscricoes: pago + status PAGO/PENDENTE.
 * So vale para inscricoes de torneios que tem a arena (pointId) como sede.
 */
export async function POST(request: NextRequest) {
  if (!integracaoAutorizada(request)) return naoAutorizado();

  const body = (await request.json().catch(() => null)) as any;
  const pointId = typeof body?.pointId === "string" ? body.pointId.trim() : "";
  if (!pointId) return respostaJson({ error: "pointId é obrigatório" }, 400);
  if (typeof body?.pago !== "boolean") return respostaJson({ error: "pago é obrigatório" }, 400);
  const pago = body.pago as boolean;

  const itens: { inscricaoId: string; atletaId: string }[] = (Array.isArray(body?.itens) ? body.itens : [])
    .map((i: any) => ({ inscricaoId: String(i?.inscricaoId || "").trim(), atletaId: String(i?.atletaId || "").trim() }))
    .filter((i: { inscricaoId: string; atletaId: string }) => UUID.test(i.inscricaoId) && UUID.test(i.atletaId))
    .slice(0, 200);
  if (itens.length === 0) return respostaJson({ error: "Informe as inscrições" }, 400);

  // Inscricoes da arena sede, com os integrantes da dupla
  const ids = Array.from(new Set(itens.map((i) => i.inscricaoId)));
  const validas = await db
    .select({ inscricaoId: inscricoes.id, usuarioId: equipeIntegrantes.usuarioId })
    .from(inscricoes)
    .innerJoin(torneios, eq(torneios.id, inscricoes.torneioId))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .where(and(inArray(inscricoes.id, ids), eq(torneios.pointIdSede, pointId)));
  const permitidas = new Set(validas.map((v) => `${v.inscricaoId}:${v.usuarioId}`));

  const resultados: { inscricaoId: string; atletaId: string; ok: boolean; motivo?: string }[] = [];
  for (const item of itens) {
    if (!permitidas.has(`${item.inscricaoId}:${item.atletaId}`)) {
      resultados.push({ ...item, ok: false, motivo: "Inscrição não encontrada para esta arena" });
      continue;
    }
    await db
      .insert(inscricaoPagamentos)
      .values({ inscricaoId: item.inscricaoId, usuarioId: item.atletaId, pago, status: pago ? "PAGO" : "PENDENTE" })
      .onConflictDoUpdate({
        target: [inscricaoPagamentos.inscricaoId, inscricaoPagamentos.usuarioId],
        set: { pago, status: pago ? "PAGO" : "PENDENTE" },
      });
    resultados.push({ ...item, ok: true });
  }

  return respostaJson({ ok: true, pago, resultados });
}
