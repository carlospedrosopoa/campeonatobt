import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { db } from "@/db";
import { arenas, equipeIntegrantes, grupos, partidas, rodadas, usuarios } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const fase = (searchParams.get("fase") || "").trim();

    const rows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        rodadaId: partidas.rodadaId,
        rodadaNome: rodadas.nome,
        rodadaNumero: rodadas.numero,
        rodadaDataLimite: rodadas.dataLimite,
        grupoId: partidas.grupoId,
        grupoNome: grupos.nome,
        arenaId: partidas.arenaId,
        arenaNome: arenas.nome,
        arenaLogoUrl: arenas.logoUrl,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
        dataHorario: partidas.dataHorario,
        dataLimite: partidas.dataLimite,
        quadra: partidas.quadra,
        fotoUrl: partidas.fotoUrl,
        transmissaoUrl: partidas.transmissaoUrl,
      })
      .from(partidas)
      .leftJoin(grupos, eq(partidas.grupoId, grupos.id))
      .leftJoin(rodadas, eq(partidas.rodadaId, rodadas.id))
      .leftJoin(arenas, eq(partidas.arenaId, arenas.id))
      .where(
        fase
          ? and(eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId), eq(partidas.fase, fase as any))
          : and(eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId))
      )
      .orderBy(asc(rodadas.numero), asc(partidas.criadoEm));

    const equipeIds = Array.from(new Set(rows.flatMap((r) => [r.equipeAId, r.equipeBId]).filter(Boolean))) as string[];
    const mapNomes = await equipesDisplayService.mapNomesEquipes(equipeIds);
    const atletasRows =
      equipeIds.length > 0
        ? await db
            .select({
              equipeId: equipeIntegrantes.equipeId,
              atletaId: usuarios.id,
              atletaNome: usuarios.nome,
              atletaFotoUrl: usuarios.fotoUrl,
            })
            .from(equipeIntegrantes)
            .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
            .where(inArray(equipeIntegrantes.equipeId, equipeIds))
        : [];

    const mapAtletas = new Map<string, { id: string; nome: string; fotoUrl: string | null }[]>();
    for (const a of atletasRows) {
      const current = mapAtletas.get(a.equipeId) ?? [];
      current.push({ id: a.atletaId, nome: a.atletaNome, fotoUrl: a.atletaFotoUrl ?? null });
      mapAtletas.set(a.equipeId, current);
    }

    const result = rows.map((r) => ({
      ...r,
      equipeANome: mapNomes.get(r.equipeAId) ?? null,
      equipeBNome: mapNomes.get(r.equipeBId) ?? null,
      equipeAAtletas: r.equipeAId ? mapAtletas.get(r.equipeAId) ?? [] : [],
      equipeBAtletas: r.equipeBId ? mapAtletas.get(r.equipeBId) ?? [] : [],
    }));

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao listar partidas públicas:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
