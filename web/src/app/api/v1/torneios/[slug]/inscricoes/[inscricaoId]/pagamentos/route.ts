import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { equipeIntegrantes, inscricaoPagamentos, inscricoes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; inscricaoId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, inscricaoId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const body = (await request.json().catch(() => null)) as any;
    const atletaId = typeof body?.atletaId === "string" ? body.atletaId.trim() : "";
    const pago = Boolean(body?.pago);
    if (!atletaId) return NextResponse.json({ error: "atletaId é obrigatório" }, { status: 400 });

    const ins = await db
      .select({ id: inscricoes.id, torneioId: inscricoes.torneioId, equipeId: inscricoes.equipeId })
      .from(inscricoes)
      .where(eq(inscricoes.id, inscricaoId))
      .limit(1);
    const row = ins[0];
    if (!row || row.torneioId !== torneio.id) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });

    const membro = await db
      .select({ id: equipeIntegrantes.id })
      .from(equipeIntegrantes)
      .where(and(eq(equipeIntegrantes.equipeId, row.equipeId), eq(equipeIntegrantes.usuarioId, atletaId)))
      .limit(1);
    if (!membro[0]) return NextResponse.json({ error: "Atleta não pertence a esta inscrição" }, { status: 400 });

    const [saved] = await db
      .insert(inscricaoPagamentos)
      .values({ inscricaoId, usuarioId: atletaId, pago, status: pago ? "PAGO" : "PENDENTE" })
      .onConflictDoUpdate({
        target: [inscricaoPagamentos.inscricaoId, inscricaoPagamentos.usuarioId],
        set: { pago, status: pago ? "PAGO" : "PENDENTE" },
      })
      .returning();

    return NextResponse.json({ ok: true, inscricaoId, atletaId, pago: saved?.pago ?? pago }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
