import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, partidas, placarSubmissoes, torneios } from "@/db/schema";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const equipeRows = await db
    .select({ equipeId: equipeIntegrantes.equipeId })
    .from(equipeIntegrantes)
    .where(eq(equipeIntegrantes.usuarioId, auth.user.id));
  const equipeIds = Array.from(new Set(equipeRows.map((r) => r.equipeId))).filter(Boolean) as string[];
  if (equipeIds.length === 0) return NextResponse.json({ partidas: [] }, { headers: { "Cache-Control": "no-store" } });

  const rows = await db
    .select({
      id: partidas.id,
      torneioId: partidas.torneioId,
      torneioNome: torneios.nome,
      torneioSlug: torneios.slug,
      categoriaId: partidas.categoriaId,
      categoriaNome: categorias.nome,
      fase: partidas.fase,
      status: partidas.status,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
      placarA: partidas.placarA,
      placarB: partidas.placarB,
      detalhesPlacar: partidas.detalhesPlacar,
      dataHorario: partidas.dataHorario,
      quadra: partidas.quadra,
    })
    .from(partidas)
    .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
    .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
    .where(or(inArray(partidas.equipeAId, equipeIds), inArray(partidas.equipeBId, equipeIds)))
    .orderBy(desc(partidas.dataHorario), asc(partidas.criadoEm))
    .limit(50);

  const ids = Array.from(new Set(rows.flatMap((r) => [r.equipeAId, r.equipeBId]).filter(Boolean))) as string[];
  const mapNomes = await equipesDisplayService.mapNomesEquipes(ids);

  const partidaIds = Array.from(new Set(rows.map((r) => r.id))).filter(Boolean) as string[];
  const pendentes = new Set<string>();
  if (partidaIds.length > 0) {
    const pendentesRows = await db
      .select({ partidaId: placarSubmissoes.partidaId })
      .from(placarSubmissoes)
      .where(and(inArray(placarSubmissoes.partidaId, partidaIds), eq(placarSubmissoes.status, "PENDENTE")));
    for (const pr of pendentesRows) pendentes.add(pr.partidaId);
  }

  const partidasResult = rows.map((r) => ({
    id: r.id,
    torneio: { id: r.torneioId, nome: r.torneioNome, slug: r.torneioSlug },
    categoria: { id: r.categoriaId, nome: r.categoriaNome },
    fase: r.fase,
    status: r.status,
    equipeA: { id: r.equipeAId, nome: mapNomes.get(r.equipeAId) ?? null },
    equipeB: { id: r.equipeBId, nome: mapNomes.get(r.equipeBId) ?? null },
    placarA: r.placarA,
    placarB: r.placarB,
    detalhesPlacar: r.detalhesPlacar,
    dataHorario: r.dataHorario,
    quadra: r.quadra,
    meuLado: equipeIds.includes(r.equipeAId) ? "A" : equipeIds.includes(r.equipeBId) ? "B" : null,
    placarSubmissaoPendente: pendentes.has(r.id),
  }));

  return NextResponse.json({ partidas: partidasResult }, { headers: { "Cache-Control": "no-store" } });
}
