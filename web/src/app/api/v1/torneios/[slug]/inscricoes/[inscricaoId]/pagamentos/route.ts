﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { equipeIntegrantes, inscricaoPagamentos, inscricoes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

function normalizarValorDevido(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value.toFixed(2);
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; inscricaoId: string }> }
) {
  try {
    const { slug, inscricaoId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = (await request.json().catch(() => null)) as any;
    const atletaId = typeof body?.atletaId === "string" ? body.atletaId.trim() : "";
    const hasPago = typeof body?.pago === "boolean";
    const pago = hasPago ? Boolean(body.pago) : false;
    const valorDevido = normalizarValorDevido(body?.valorDevido);
    if (!atletaId) return NextResponse.json({ error: "atletaId Ã© obrigatÃ³rio" }, { status: 400 });
    if (!hasPago && valorDevido === undefined) {
      return NextResponse.json({ error: "Informe pelo menos um campo para atualizaÃ§Ã£o" }, { status: 400 });
    }

    const ins = await db
      .select({ id: inscricoes.id, torneioId: inscricoes.torneioId, equipeId: inscricoes.equipeId })
      .from(inscricoes)
      .where(eq(inscricoes.id, inscricaoId))
      .limit(1);
    const row = ins[0];
    if (!row || row.torneioId !== torneio.id) return NextResponse.json({ error: "InscriÃ§Ã£o nÃ£o encontrada" }, { status: 404 });

    const membro = await db
      .select({ id: equipeIntegrantes.id })
      .from(equipeIntegrantes)
      .where(and(eq(equipeIntegrantes.equipeId, row.equipeId), eq(equipeIntegrantes.usuarioId, atletaId)))
      .limit(1);
    if (!membro[0]) return NextResponse.json({ error: "Atleta nÃ£o pertence a esta inscriÃ§Ã£o" }, { status: 400 });

    const existente = await db
      .select({
        pago: inscricaoPagamentos.pago,
        status: inscricaoPagamentos.status,
        valorDevido: inscricaoPagamentos.valorDevido,
      })
      .from(inscricaoPagamentos)
      .where(and(eq(inscricaoPagamentos.inscricaoId, inscricaoId), eq(inscricaoPagamentos.usuarioId, atletaId)))
      .limit(1);
    const atual = existente[0];

    const pagoFinal = hasPago ? pago : Boolean(atual?.pago);
    const statusFinal = pagoFinal ? "PAGO" : "PENDENTE";

    const [saved] = await db
      .insert(inscricaoPagamentos)
      .values({
        inscricaoId,
        usuarioId: atletaId,
        pago: pagoFinal,
        status: statusFinal,
        valorDevido: valorDevido === undefined ? null : valorDevido,
      })
      .onConflictDoUpdate({
        target: [inscricaoPagamentos.inscricaoId, inscricaoPagamentos.usuarioId],
        set: {
          ...(hasPago ? { pago: pagoFinal, status: statusFinal } : {}),
          ...(valorDevido !== undefined ? { valorDevido } : {}),
        },
      })
      .returning();

    return NextResponse.json(
      { ok: true, inscricaoId, atletaId, pago: saved?.pago ?? pagoFinal, valorDevido: saved?.valorDevido ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

