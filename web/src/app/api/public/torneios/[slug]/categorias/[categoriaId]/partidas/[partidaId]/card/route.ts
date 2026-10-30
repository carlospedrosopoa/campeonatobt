import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { arenas, partidas, rodadas } from "@/db/schema";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { gerarCardPartidaPng } from "@/lib/card-servidor";

export const runtime = "nodejs";

// o app do atleta busca a imagem direto neste dominio para compartilhar
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function erro(mensagem: string, status: number) {
  return NextResponse.json({ error: mensagem }, { status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** PNG do card de um jogo (programacao ou resultado), no mesmo desenho e modelo do admin. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const { slug, categoriaId, partidaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio || torneio.oculto) return erro("Torneio não encontrado", 404);

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) return erro("Categoria não encontrada", 404);

    const [p] = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
        dataHorario: partidas.dataHorario,
        quadra: partidas.quadra,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        rodadaNome: rodadas.nome,
        rodadaNumero: rodadas.numero,
        arenaNome: arenas.nome,
      })
      .from(partidas)
      .leftJoin(rodadas, eq(partidas.rodadaId, rodadas.id))
      .leftJoin(arenas, eq(partidas.arenaId, arenas.id))
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);
    if (!p) return erro("Jogo não encontrado", 404);

    const equipeIds = [p.equipeAId, p.equipeBId].filter(Boolean) as string[];
    const [mapNomes, mapAtletas] = await Promise.all([
      equipesDisplayService.mapNomesEquipes(equipeIds, { categoriaId }),
      equipesDisplayService.mapAtletasEquipes(equipeIds, { categoriaId }),
    ]);
    const atletasA = p.equipeAId ? mapAtletas.get(p.equipeAId) ?? [] : [];
    const atletasB = p.equipeBId ? mapAtletas.get(p.equipeBId) ?? [] : [];
    if (!atletasA.length || !atletasB.length) return erro("As duas duplas do jogo ainda não estão definidas", 400);

    // placar so entra no card depois de encerrado (antes, e o card de programacao)
    const encerrado = p.status === "FINALIZADA" || p.status === "WO";
    const png = await gerarCardPartidaPng({
      categoriaNome: categoria.nome,
      cardApenasComFotos: torneio.cardApenasComFotos,
      templateUrl: torneio.templateUrl ?? null,
      layout: torneio.layoutCards ?? null,
      partida: {
        id: p.id,
        fase: p.fase,
        placarA: encerrado ? p.placarA : null,
        placarB: encerrado ? p.placarB : null,
        detalhesPlacar: encerrado ? p.detalhesPlacar : null,
        rodadaNome: p.rodadaNome ?? null,
        rodadaNumero: p.rodadaNumero ?? null,
        dataHorario: p.dataHorario ? p.dataHorario.toISOString() : null,
        arenaNome: p.arenaNome ?? null,
        quadra: p.quadra ?? null,
        equipeANome: mapNomes.get(p.equipeAId) ?? null,
        equipeBNome: mapNomes.get(p.equipeBId) ?? null,
        equipeAAtletas: atletasA.map((a) => ({ id: a.id, nome: a.nome, fotoUrl: a.fotoUrl ?? null })),
        equipeBAtletas: atletasB.map((a) => ({ id: a.id, nome: a.nome, fotoUrl: a.fotoUrl ?? null })),
      },
    });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        ...CORS,
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="card-${p.id}.png"`,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar card do jogo:", error);
    return erro("Erro interno do servidor", 500);
  }
}
