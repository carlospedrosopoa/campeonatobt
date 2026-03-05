import { db } from "@/db";
import { partidas, rodadas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; rodadaId: string }> }
) {
  try {
    const { rodadaId } = await params;
    const body = await request.json();
    const { dataLimite } = body;

    if (!dataLimite) {
      return NextResponse.json({ error: "Data limite é obrigatória" }, { status: 400 });
    }

    const dataLimiteDate = new Date(dataLimite);
    if (isNaN(dataLimiteDate.getTime())) {
      return NextResponse.json({ error: "Data limite inválida" }, { status: 400 });
    }

    // 1. Atualizar a rodada
    await db
      .update(rodadas)
      .set({ dataLimite: dataLimiteDate })
      .where(eq(rodadas.id, rodadaId));

    // 2. Replicar para as partidas da rodada
    await db
      .update(partidas)
      .set({ dataLimite: dataLimiteDate })
      .where(eq(partidas.rodadaId, rodadaId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao atualizar rodada:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar rodada" }, { status: 500 });
  }
}
