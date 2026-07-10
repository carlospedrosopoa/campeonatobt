import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, partidas, placarSubmissoes, torneios } from "@/db/schema";
import { obterRegrasPartidaEfetivas } from "@/lib/regras-partida";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { categoriaConfigService } from "@/services/categoria-config.service";

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
      superCampeonato: torneios.superCampeonato,
      superCampeonatoFormato: torneios.superCampeonatoFormato,
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
  const categoriaIds = Array.from(new Set(rows.map((r) => r.categoriaId).filter(Boolean))) as string[];
  const configEntries = await Promise.all(
    categoriaIds.map(async (categoriaId) => [categoriaId, await categoriaConfigService.obterOuDefault(categoriaId)] as const)
  );
  const configMap = new Map(configEntries);

  const partidaIds = Array.from(new Set(rows.map((r) => r.id))).filter(Boolean) as string[];
  const pendentesMap = new Map<
    string,
    {
      id: string;
      usuarioId: string;
      vencedorId: string | null;
      placarA: number;
      placarB: number;
      detalhesPlacar: any;
    }
  >();
  if (partidaIds.length > 0) {
    const pendentesRows = await db
      .select({
        id: placarSubmissoes.id,
        partidaId: placarSubmissoes.partidaId,
        usuarioId: placarSubmissoes.usuarioId,
        vencedorId: placarSubmissoes.vencedorId,
        placarA: placarSubmissoes.placarA,
        placarB: placarSubmissoes.placarB,
        detalhesPlacar: placarSubmissoes.detalhesPlacar,
      })
      .from(placarSubmissoes)
      .where(and(inArray(placarSubmissoes.partidaId, partidaIds), eq(placarSubmissoes.status, "PENDENTE")));
    for (const pr of pendentesRows) {
      pendentesMap.set(pr.partidaId, {
        id: pr.id,
        usuarioId: pr.usuarioId,
        vencedorId: pr.vencedorId ?? null,
        placarA: pr.placarA,
        placarB: pr.placarB,
        detalhesPlacar: pr.detalhesPlacar,
      });
    }
  }

  const equipesRows = ids.length
    ? await db.select({ id: equipes.id, capitaoUsuarioId: equipes.capitaoUsuarioId }).from(equipes).where(inArray(equipes.id, ids))
    : [];
  const capitaoMap = new Map(equipesRows.map((e) => [e.id, e.capitaoUsuarioId ?? null] as const));

  const partidasResult = rows.map((r) => {
    const config = configMap.get(r.categoriaId);
    const pendente = pendentesMap.get(r.id) ?? null;
    const capitaoEquipeAId = capitaoMap.get(r.equipeAId) ?? null;
    const capitaoEquipeBId = capitaoMap.get(r.equipeBId) ?? null;
    const souCapitao =
      (capitaoEquipeAId && capitaoEquipeAId === auth.user.id) || (capitaoEquipeBId && capitaoEquipeBId === auth.user.id);
    const souCapitaoA = Boolean(capitaoEquipeAId && capitaoEquipeAId === auth.user.id);
    const souCapitaoB = Boolean(capitaoEquipeBId && capitaoEquipeBId === auth.user.id);

    return {
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
      souCapitao,
      souCapitaoDoLado: souCapitaoA ? "A" : souCapitaoB ? "B" : null,
      capitaoEquipeAId,
      capitaoEquipeBId,
      placarSubmissaoPendente: Boolean(pendente),
      placarSubmissao: pendente
        ? {
            id: pendente.id,
            status: "PENDENTE" as const,
            informadoPorUsuarioId: pendente.usuarioId,
            vencedorId: pendente.vencedorId,
            placarA: pendente.placarA,
            placarB: pendente.placarB,
            detalhesPlacar: pendente.detalhesPlacar,
          }
        : null,
      regrasPartida: obterRegrasPartidaEfetivas({
        regrasBase: config?.regrasPartida,
        superCampeonato: r.superCampeonato,
        superCampeonatoFormato: r.superCampeonatoFormato,
      }),
    };
  });

  return NextResponse.json({ meuUsuarioId: auth.user.id, partidas: partidasResult }, { headers: { "Cache-Control": "no-store" } });
}
