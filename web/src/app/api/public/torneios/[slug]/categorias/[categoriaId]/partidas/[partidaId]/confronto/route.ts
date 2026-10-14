import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { partidas } from "@/db/schema";
import { torneiosService } from "@/services/torneios.service";
import { confrontosService } from "@/services/confrontos.service";

/** Historico de confrontos entre as duplas e os atletas de um jogo (publico). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const { slug, categoriaId, partidaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio || torneio.oculto) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const [partida] = await db
      .select({ id: partidas.id })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);
    if (!partida) return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });

    const confronto = await confrontosService.daPartida(partidaId);
    return NextResponse.json(confronto, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("Erro ao montar confronto:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
