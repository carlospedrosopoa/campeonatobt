import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { equipeIntegrantes, inscricoes, torneioAtletaPrefs } from "@/db/schema";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";

/** Marca (ou desmarca) a entrega da camiseta do torneio a um atleta inscrito. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string; atletaId: string }> }) {
  try {
    const { slug, atletaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = (await request.json().catch(() => null)) as { entregue?: unknown } | null;
    if (typeof body?.entregue !== "boolean") {
      return NextResponse.json({ error: "Informe se a camiseta foi entregue" }, { status: 400 });
    }

    // so atleta inscrito neste torneio
    const [inscrito] = await db
      .select({ id: equipeIntegrantes.usuarioId })
      .from(equipeIntegrantes)
      .innerJoin(inscricoes, eq(inscricoes.equipeId, equipeIntegrantes.equipeId))
      .where(and(eq(inscricoes.torneioId, torneio.id), eq(equipeIntegrantes.usuarioId, atletaId)))
      .limit(1);
    if (!inscrito) return NextResponse.json({ error: "Atleta não está inscrito neste torneio" }, { status: 404 });

    const entregueEm = body.entregue ? new Date() : null;
    const [salvo] = await db
      .insert(torneioAtletaPrefs)
      .values({ torneioId: torneio.id, usuarioId: atletaId, camisetaEntregueEm: entregueEm, atualizadoEm: new Date() })
      .onConflictDoUpdate({
        target: [torneioAtletaPrefs.torneioId, torneioAtletaPrefs.usuarioId],
        set: { camisetaEntregueEm: entregueEm, atualizadoEm: new Date() },
      })
      .returning({ camisetaEntregueEm: torneioAtletaPrefs.camisetaEntregueEm });

    return NextResponse.json(
      { ok: true, camisetaEntregueEm: salvo?.camisetaEntregueEm ? salvo.camisetaEntregueEm.toISOString() : null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao marcar entrega de camiseta:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
