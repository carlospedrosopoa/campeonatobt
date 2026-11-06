import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { torneios } from "@/db/schema";

/** Rotas de integracao com o Play na Quadra (carlaobtonline): token fixo de servidor para servidor. */
function tokenDaRequisicao(request: NextRequest) {
  const header = request.headers.get("x-integration-token");
  if (header && header.trim()) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

export function integracaoAutorizada(request: NextRequest) {
  const segredo = (process.env.CAMPEONATOBT_INTEGRATION_TOKEN || process.env.INTEGRATION_CARLAOBTONLINE_TOKEN || "").trim();
  const token = tokenDaRequisicao(request);
  if (!segredo || !token) return false;
  const a = Buffer.from(segredo);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function respostaJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function naoAutorizado() {
  return respostaJson({ error: "Não autorizado" }, 401);
}

/** Torneio que tem a arena (point) como sede; null se nao existir ou for de outra arena. */
export async function torneioDaArena(torneioId: string, pointId: string) {
  if (!torneioId || !pointId) return null;
  const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(torneioId);
  if (!uuidValido) return null;
  const rows = await db
    .select({ id: torneios.id, nome: torneios.nome, slug: torneios.slug, status: torneios.status })
    .from(torneios)
    .where(and(eq(torneios.id, torneioId), eq(torneios.pointIdSede, pointId)))
    .limit(1);
  return rows[0] ?? null;
}
