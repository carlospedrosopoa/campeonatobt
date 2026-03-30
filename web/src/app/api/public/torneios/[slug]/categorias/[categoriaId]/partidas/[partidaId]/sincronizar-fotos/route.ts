import { NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { db } from "@/db";
import { equipeIntegrantes, partidas, usuarios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playGetAtletaById } from "@/services/playnaquadra-client";

type SyncResult = {
  updated: Array<{ usuarioId: string; fotoUrl: string }>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const { slug, categoriaId, partidaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const partidaRows = await db
      .select({
        id: partidas.id,
        torneioId: partidas.torneioId,
        categoriaId: partidas.categoriaId,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);

    const partidaAtual = partidaRows[0];
    if (!partidaAtual) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    const equipeIds = [partidaAtual.equipeAId, partidaAtual.equipeBId].filter(Boolean) as string[];
    if (!equipeIds.length) return NextResponse.json({ updated: [] satisfies SyncResult["updated"] });

    const atletas = await db
      .select({
        usuarioId: usuarios.id,
        nome: usuarios.nome,
        fotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));

    const pendentes = atletas.filter((a) => (!a.fotoUrl || !a.fotoUrl.trim()) && a.playnaquadraAtletaId);
    if (!pendentes.length) return NextResponse.json({ updated: [] satisfies SyncResult["updated"] });

    const token = await getPlayAdminToken();
    const updated: SyncResult["updated"] = [];

    for (const atleta of pendentes) {
      const playId = atleta.playnaquadraAtletaId as string;
      try {
        const { res, data } = await playGetAtletaById({ token, atletaId: playId });
        if (!res.ok || !data) continue;
        const fotoUrl = (data?.fotoUrl as string | undefined) || (data?.atleta?.fotoUrl as string | undefined) || null;
        if (!fotoUrl) continue;
        await db.update(usuarios).set({ fotoUrl, atualizadoEm: new Date() }).where(eq(usuarios.id, atleta.usuarioId));
        updated.push({ usuarioId: atleta.usuarioId, fotoUrl });
      } catch {
        continue;
      }
    }

    return NextResponse.json({ updated } satisfies SyncResult, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao sincronizar fotos dos atletas para card:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
