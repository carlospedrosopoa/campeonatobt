import { NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { arenas, categorias, equipeIntegrantes, grupos, inscricoes, partidas, rodadas, usuarios } from "@/db/schema";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; atletaId: string }> }) {
  try {
    const { slug, atletaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio || torneio.oculto) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const atletaRows = await db
      .select({ id: usuarios.id, nome: usuarios.nome, fotoUrl: usuarios.fotoUrl })
      .from(usuarios)
      .where(eq(usuarios.id, atletaId))
      .limit(1);
    const atleta = atletaRows[0];
    if (!atleta) return NextResponse.json({ error: "Atleta não encontrado" }, { status: 404 });

    const equipesRows = await db
      .select({ equipeId: inscricoes.equipeId })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .where(and(eq(inscricoes.torneioId, torneio.id), eq(inscricoes.status, "APROVADA"), eq(equipeIntegrantes.usuarioId, atletaId)))
      .groupBy(inscricoes.equipeId);

    const equipeIds = equipesRows.map((r) => r.equipeId).filter(Boolean) as string[];
    if (equipeIds.length === 0) {
      return NextResponse.json(
        { torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug, superCampeonato: torneio.superCampeonato ?? false }, atleta, partidas: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const rows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        rodadaId: partidas.rodadaId,
        rodadaNome: rodadas.nome,
        rodadaNumero: rodadas.numero,
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
        criadoEm: partidas.criadoEm,
        categoriaId: partidas.categoriaId,
      })
      .from(partidas)
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .leftJoin(grupos, eq(partidas.grupoId, grupos.id))
      .leftJoin(rodadas, eq(partidas.rodadaId, rodadas.id))
      .leftJoin(arenas, eq(partidas.arenaId, arenas.id))
      .where(and(eq(partidas.torneioId, torneio.id), or(inArray(partidas.equipeAId, equipeIds), inArray(partidas.equipeBId, equipeIds))))
      .orderBy(asc(partidas.dataHorario), asc(rodadas.numero), asc(partidas.criadoEm));

    const categoriaIds = Array.from(new Set(rows.map((r) => r.categoriaId).filter(Boolean))) as string[];

    const equipeIdsPorCategoria = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.categoriaId) continue;
      const list = equipeIdsPorCategoria.get(r.categoriaId) ?? [];
      if (r.equipeAId && !list.includes(r.equipeAId)) list.push(r.equipeAId);
      if (r.equipeBId && !list.includes(r.equipeBId)) list.push(r.equipeBId);
      equipeIdsPorCategoria.set(r.categoriaId, list);
    }

    const nomesPorCategoria = new Map<string, Map<string, string>>();
    const atletasPorCategoria = new Map<string, Map<string, { id: string; nome: string; fotoUrl: string | null }[]>>();
    for (const catId of categoriaIds) {
      const eqs = equipeIdsPorCategoria.get(catId) ?? [];
      const [nomes, atletas] = await Promise.all([
        equipesDisplayService.mapNomesEquipes(eqs, { categoriaId: catId }),
        equipesDisplayService.mapAtletasEquipes(eqs, { categoriaId: catId }),
      ]);
      nomesPorCategoria.set(catId, nomes);
      atletasPorCategoria.set(catId, atletas);
    }

    const result = rows.map((r) => {
      const meuTimeId = equipeIds.includes(r.equipeAId) ? r.equipeAId : r.equipeBId;
      const nomesMap = r.categoriaId ? nomesPorCategoria.get(r.categoriaId) : undefined;
      const atletasMap = r.categoriaId ? atletasPorCategoria.get(r.categoriaId) : undefined;
      return {
        ...r,
        equipeANome: nomesMap?.get(r.equipeAId) ?? null,
        equipeBNome: nomesMap?.get(r.equipeBId) ?? null,
        equipeAAtletas: r.equipeAId ? atletasMap?.get(r.equipeAId) ?? [] : [],
        equipeBAtletas: r.equipeBId ? atletasMap?.get(r.equipeBId) ?? [] : [],
        meuTimeId,
      };
    });

    return NextResponse.json(
      { torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug, superCampeonato: torneio.superCampeonato ?? false }, atleta, partidas: result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao obter dashboard público do atleta:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
