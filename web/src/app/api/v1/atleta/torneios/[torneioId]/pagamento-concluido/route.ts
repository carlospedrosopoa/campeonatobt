import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { equipeIntegrantes, inscricaoPagamentos, inscricoes } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ torneioId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { torneioId } = await params;
  const tId = (torneioId || "").trim();
  if (!tId) return NextResponse.json({ error: "torneioId inválido" }, { status: 400 });

  const inscricaoRows = await db
    .select({ inscricaoId: inscricoes.id })
    .from(inscricoes)
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .where(and(eq(inscricoes.torneioId, tId), eq(equipeIntegrantes.usuarioId, auth.user.id)));

  const ids = inscricaoRows.map((r) => r.inscricaoId);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhuma inscrição encontrada para este torneio" }, { status: 404 });
  }

  await db
    .update(inscricaoPagamentos)
    .set({ pago: false, status: "PROCESSANDO" })
    .where(
      and(eq(inscricaoPagamentos.usuarioId, auth.user.id), inArray(inscricaoPagamentos.inscricaoId, ids), sql`${inscricaoPagamentos.status} <> 'PAGO'`)
    );

  return NextResponse.json(
    { ok: true, torneioId: tId, status: "PROCESSANDO" },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}

