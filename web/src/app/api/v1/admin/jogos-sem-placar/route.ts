import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNotNull, isNull, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import { categorias, partidas, placarSubmissoes, torneios } from "@/db/schema";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";
import { equipesDisplayService } from "@/services/equipes-display.service";

/**
 * Jogos com a data ja passada e ainda sem placar (agendados ou em andamento), de todos os torneios ativos.
 * "Data" e o horario marcado; sem horario, vale a data limite.
 */
export async function GET() {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;

  const agora = new Date();
  const rows = await db
    .select({
      id: partidas.id,
      fase: partidas.fase,
      status: partidas.status,
      quadra: partidas.quadra,
      dataHorario: partidas.dataHorario,
      dataLimite: partidas.dataLimite,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
      categoriaId: partidas.categoriaId,
      categoriaNome: categorias.nome,
      torneioId: torneios.id,
      torneioNome: torneios.nome,
      torneioSlug: torneios.slug,
      superCampeonato: torneios.superCampeonato,
    })
    .from(partidas)
    .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
    .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
    .where(
      and(
        inArray(partidas.status, ["AGENDADA", "EM_ANDAMENTO"]),
        notInArray(torneios.status, ["CANCELADO", "RASCUNHO"]),
        or(
          and(isNotNull(partidas.dataHorario), lt(partidas.dataHorario, agora)),
          and(isNull(partidas.dataHorario), isNotNull(partidas.dataLimite), lt(partidas.dataLimite, agora))
        )
      )
    )
    .orderBy(asc(torneios.nome), asc(categorias.nome), asc(partidas.dataHorario), asc(partidas.dataLimite));

  const ids = rows.map((r) => r.id);
  const [nomes, pendentes] = await Promise.all([
    equipesDisplayService.mapNomesEquipes(rows.flatMap((r) => [r.equipeAId, r.equipeBId])),
    ids.length
      ? db
          .select({ partidaId: placarSubmissoes.partidaId })
          .from(placarSubmissoes)
          .where(and(inArray(placarSubmissoes.partidaId, ids), eq(placarSubmissoes.status, "PENDENTE")))
      : Promise.resolve([] as { partidaId: string }[]),
  ]);
  const comPendente = new Set(pendentes.map((p) => p.partidaId));

  const jogos = rows.map((r) => ({
    id: r.id,
    fase: r.fase,
    status: r.status,
    quadra: r.quadra,
    data: (r.dataHorario ?? r.dataLimite)?.toISOString() ?? null,
    dataEhLimite: !r.dataHorario,
    equipeA: nomes.get(r.equipeAId) ?? "A definir",
    equipeB: nomes.get(r.equipeBId) ?? "A definir",
    placarPendente: comPendente.has(r.id),
    torneio: { id: r.torneioId, nome: r.torneioNome, slug: r.torneioSlug, superCampeonato: r.superCampeonato },
    categoria: { id: r.categoriaId, nome: r.categoriaNome },
  }));

  return NextResponse.json({ jogos }, { headers: { "Cache-Control": "no-store" } });
}
