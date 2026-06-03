import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { equipeIntegrantes, inscricaoPagamentos, inscricoes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inscricaoId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { inscricaoId } = await params;
  const id = (inscricaoId || "").trim();
  if (!id) return NextResponse.json({ error: "inscricaoId inválido" }, { status: 400 });

  const ins = await db
    .select({ inscricaoId: inscricoes.id, equipeId: inscricoes.equipeId })
    .from(inscricoes)
    .where(eq(inscricoes.id, id))
    .limit(1);
  const row = ins[0];
  if (!row) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });

  const membro = await db
    .select({ id: equipeIntegrantes.id })
    .from(equipeIntegrantes)
    .where(and(eq(equipeIntegrantes.equipeId, row.equipeId), eq(equipeIntegrantes.usuarioId, auth.user.id)))
    .limit(1);
  if (!membro[0]) return NextResponse.json({ error: "Você não pertence a esta inscrição" }, { status: 403 });

  const [saved] = await db
    .insert(inscricaoPagamentos)
    .values({ inscricaoId: id, usuarioId: auth.user.id, pago: false, status: "PROCESSANDO" })
    .onConflictDoUpdate({
      target: [inscricaoPagamentos.inscricaoId, inscricaoPagamentos.usuarioId],
      set: { pago: false, status: "PROCESSANDO" },
    })
    .returning();

  return NextResponse.json(
    { ok: true, inscricaoId: id, status: saved?.status ?? "PROCESSANDO" },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}

