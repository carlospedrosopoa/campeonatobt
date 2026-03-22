import { db } from "@/db";
import { partidas, rodadas } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; rodadaId: string }> }
) {
  try {
    const { rodadaId, categoriaId } = await params;
    const body = await request.json();
    const { dataLimite } = body;

    if (!dataLimite) {
      return NextResponse.json({ error: "Data limite é obrigatória" }, { status: 400 });
    }

    const dataLimiteDate = new Date(dataLimite);
    if (isNaN(dataLimiteDate.getTime())) {
      return NextResponse.json({ error: "Data limite inválida" }, { status: 400 });
    }

    const rodadaRows = await db
      .select({
        id: rodadas.id,
        torneioId: rodadas.torneioId,
        categoriaId: rodadas.categoriaId,
        numero: rodadas.numero,
      })
      .from(rodadas)
      .where(eq(rodadas.id, rodadaId))
      .limit(1);

    const rodadaAtual = rodadaRows[0];
    if (!rodadaAtual) {
      return NextResponse.json({ error: "Rodada não encontrada" }, { status: 404 });
    }
    if (rodadaAtual.categoriaId && rodadaAtual.categoriaId !== categoriaId) {
      return NextResponse.json({ error: "Rodada não pertence à categoria" }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      if (rodadaAtual.numero === 1) {
        const todasRodadas = await tx
          .select({
            id: rodadas.id,
            numero: rodadas.numero,
          })
          .from(rodadas)
          .where(
            and(
              eq(rodadas.torneioId, rodadaAtual.torneioId),
              eq(rodadas.categoriaId, categoriaId)
            )
          )
          .orderBy(asc(rodadas.numero));

        for (const r of todasRodadas) {
          if (!r.numero || r.numero < 1) continue;
          const dataRodada = new Date(dataLimiteDate);
          dataRodada.setDate(dataRodada.getDate() + (r.numero - 1) * 7);

          await tx.update(rodadas).set({ dataLimite: dataRodada }).where(eq(rodadas.id, r.id));
          await tx.update(partidas).set({ dataLimite: dataRodada }).where(eq(partidas.rodadaId, r.id));
        }
      } else {
        await tx
          .update(rodadas)
          .set({ dataLimite: dataLimiteDate })
          .where(eq(rodadas.id, rodadaId));

        await tx
          .update(partidas)
          .set({ dataLimite: dataLimiteDate })
          .where(eq(partidas.rodadaId, rodadaId));
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao atualizar rodada:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar rodada" }, { status: 500 });
  }
}
