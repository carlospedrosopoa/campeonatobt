import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { arenas, categorias, equipeIntegrantes, partidas, usuarios, torneios } from "@/db/schema";
import { and, asc, eq, inArray, gte, lte, sql } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const dataStr = searchParams.get("data"); // YYYY-MM-DD
    
    let dataInicio: Date;
    let dataFim: Date;

    if (dataStr) {
      dataInicio = new Date(`${dataStr}T00:00:00`);
      dataFim = new Date(`${dataStr}T23:59:59.999`);
    } else {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      dataInicio = hoje;
      dataFim = new Date(hoje);
      dataFim.setHours(23, 59, 59, 999);
    }

    const rows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        arenaNome: arenas.nome,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        dataHorario: partidas.dataHorario,
        quadra: partidas.quadra,
      })
      .from(partidas)
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .leftJoin(arenas, eq(partidas.arenaId, arenas.id))
      .where(
        and(
          eq(partidas.torneioId, torneio.id),
          gte(partidas.dataHorario, dataInicio),
          lte(partidas.dataHorario, dataFim)
        )
      )
      .orderBy(asc(partidas.dataHorario));

    if (rows.length === 0) {
      return NextResponse.json({ 
        torneio,
        partidas: [] 
      });
    }

    const equipeIds = Array.from(new Set(rows.flatMap((r) => [r.equipeAId, r.equipeBId]).filter(Boolean))) as string[];
    const mapNomes = await equipesDisplayService.mapNomesEquipes(equipeIds);
    
    const atletasRows = await db
      .select({
        equipeId: equipeIntegrantes.equipeId,
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaFotoUrl: usuarios.fotoUrl,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));

    const mapAtletas = new Map<string, { id: string; nome: string; fotoUrl: string | null }[]>();
    for (const a of atletasRows) {
      const current = mapAtletas.get(a.equipeId) ?? [];
      current.push({ id: a.atletaId, nome: a.atletaNome, fotoUrl: a.atletaFotoUrl ?? null });
      mapAtletas.set(a.equipeId, current);
    }

    const partidasResult = rows.map((r) => ({
      ...r,
      equipeANome: mapNomes.get(r.equipeAId) ?? null,
      equipeBNome: mapNomes.get(r.equipeBId) ?? null,
      equipeAAtletas: r.equipeAId ? mapAtletas.get(r.equipeAId) ?? [] : [],
      equipeBAtletas: r.equipeBId ? mapAtletas.get(r.equipeBId) ?? [] : [],
    }));

    return NextResponse.json({
      torneio,
      partidas: partidasResult
    });
  } catch (error) {
    console.error("Erro ao listar jogos do dia:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
