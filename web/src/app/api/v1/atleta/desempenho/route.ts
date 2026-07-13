import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricoes, partidas, torneios, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth-request";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { torneioResultadosService } from "@/services/torneio-resultados.service";

const FASE_SCORE: Record<string, number> = {
  GRUPOS: 0,
  OITAVAS: 1,
  QUARTAS: 2,
  SEMI: 3,
  FINAL: 4,
};

const FASE_LABEL: Record<string, string> = {
  GRUPOS: "Fase de grupos",
  OITAVAS: "Oitavas",
  QUARTAS: "Quartas",
  SEMI: "Semifinal",
  FINAL: "Final",
};

const STATUS_CONCLUIDOS = new Set(["FINALIZADA", "WO"]);

type AtletaResumo = {
  id: string;
  nome: string;
  fotoUrl: string | null;
  playnaquadraAtletaId: string | null;
};

function normalizarData(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function obterPesoFase(fase?: string | null) {
  if (!fase) return -1;
  return FASE_SCORE[fase] ?? -1;
}

function obterLabelFase(fase?: string | null) {
  if (!fase) return "Inscricao aprovada";
  return FASE_LABEL[fase] ?? fase;
}

function obterTimestampReferencia(item: {
  finalizadoEm?: Date | string | null;
  dataHorario?: Date | string | null;
  criadoEm?: Date | string | null;
}) {
  return (
    new Date(item.finalizadoEm || item.dataHorario || item.criadoEm || 0).getTime() ||
    0
  );
}

function obterResumoAtleta(item?: {
  id: string;
  nome: string;
  fotoUrl: string | null;
  playnaquadraAtletaId: string | null;
} | null): AtletaResumo | null {
  if (!item) return null;
  return {
    id: item.id,
    nome: item.nome,
    fotoUrl: item.fotoUrl ?? null,
    playnaquadraAtletaId: item.playnaquadraAtletaId ?? null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });

  const oponenteId = request.nextUrl.searchParams.get("oponenteId")?.trim() || "";

  const [meuAtleta] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      fotoUrl: usuarios.fotoUrl,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
    })
    .from(usuarios)
    .where(eq(usuarios.id, auth.user.id))
    .limit(1);

  const minhasEquipesRows = await db
    .select({ equipeId: equipeIntegrantes.equipeId })
    .from(equipeIntegrantes)
    .where(eq(equipeIntegrantes.usuarioId, auth.user.id));

  const minhasEquipesIds = Array.from(new Set(minhasEquipesRows.map((row) => row.equipeId).filter(Boolean))) as string[];

  let oponente: AtletaResumo | null = null;
  let equipesOponenteIds: string[] = [];

  if (oponenteId) {
    const [oponenteRow] = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        fotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(usuarios)
      .where(or(eq(usuarios.id, oponenteId), eq(usuarios.playnaquadraAtletaId, oponenteId)))
      .limit(1);

    if (!oponenteRow) {
      return NextResponse.json({ error: "Atleta adversario nao encontrado" }, { status: 404 });
    }

    oponente = obterResumoAtleta(oponenteRow);

    const equipesOponenteRows = await db
      .select({ equipeId: equipeIntegrantes.equipeId })
      .from(equipeIntegrantes)
      .where(eq(equipeIntegrantes.usuarioId, oponenteRow.id));

    equipesOponenteIds = Array.from(new Set(equipesOponenteRows.map((row) => row.equipeId).filter(Boolean))) as string[];
  }

  const inscricoesAprovadas = minhasEquipesIds.length
    ? await db
        .select({
          inscricaoId: inscricoes.id,
          dataInscricao: inscricoes.dataInscricao,
          torneioId: torneios.id,
          torneioNome: torneios.nome,
          torneioSlug: torneios.slug,
          torneioStatus: torneios.status,
          torneioDataInicio: torneios.dataInicio,
          torneioDataFim: torneios.dataFim,
          torneioLocal: torneios.local,
          categoriaId: categorias.id,
          categoriaNome: categorias.nome,
          equipeId: equipes.id,
        })
        .from(inscricoes)
        .innerJoin(torneios, eq(inscricoes.torneioId, torneios.id))
        .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
        .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
        .where(and(eq(inscricoes.status, "APROVADA"), inArray(inscricoes.equipeId, minhasEquipesIds)))
        .orderBy(desc(torneios.dataFim), desc(inscricoes.dataInscricao))
    : [];

  const minhasPartidas = minhasEquipesIds.length
    ? await db
        .select({
          id: partidas.id,
          torneioId: partidas.torneioId,
          torneioNome: torneios.nome,
          torneioSlug: torneios.slug,
          torneioStatus: torneios.status,
          torneioDataInicio: torneios.dataInicio,
          torneioDataFim: torneios.dataFim,
          categoriaId: partidas.categoriaId,
          categoriaNome: categorias.nome,
          equipeAId: partidas.equipeAId,
          equipeBId: partidas.equipeBId,
          vencedorId: partidas.vencedorId,
          fase: partidas.fase,
          status: partidas.status,
          placarA: partidas.placarA,
          placarB: partidas.placarB,
          detalhesPlacar: partidas.detalhesPlacar,
          dataHorario: partidas.dataHorario,
          finalizadoEm: partidas.finalizadoEm,
          criadoEm: partidas.criadoEm,
        })
        .from(partidas)
        .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
        .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
        .where(or(inArray(partidas.equipeAId, minhasEquipesIds), inArray(partidas.equipeBId, minhasEquipesIds)))
        .orderBy(desc(partidas.finalizadoEm), desc(partidas.dataHorario), desc(partidas.criadoEm))
    : [];

  const equipeIdsRelacionadas = Array.from(
    new Set(
      [
        ...minhasEquipesIds,
        ...equipesOponenteIds,
        ...inscricoesAprovadas.map((item) => item.equipeId),
        ...minhasPartidas.flatMap((item) => [item.equipeAId, item.equipeBId]),
      ].filter(Boolean)
    )
  ) as string[];

  const [nomesEquipes, integrantesRows] = await Promise.all([
    equipesDisplayService.mapNomesEquipes(equipeIdsRelacionadas),
    equipeIdsRelacionadas.length
      ? db
          .select({
            equipeId: equipeIntegrantes.equipeId,
            atletaId: usuarios.id,
            atletaNome: usuarios.nome,
            fotoUrl: usuarios.fotoUrl,
          })
          .from(equipeIntegrantes)
          .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
          .where(inArray(equipeIntegrantes.equipeId, equipeIdsRelacionadas))
      : Promise.resolve([]),
  ]);

  const atletasPorEquipe = new Map<
    string,
    Array<{ id: string; nome: string; fotoUrl: string | null }>
  >();
  for (const row of integrantesRows) {
    const lista = atletasPorEquipe.get(row.equipeId) ?? [];
    lista.push({
      id: row.atletaId,
      nome: row.atletaNome,
      fotoUrl: row.fotoUrl ?? null,
    });
    atletasPorEquipe.set(row.equipeId, lista);
  }

  const torneioIds = Array.from(new Set(inscricoesAprovadas.map((item) => item.torneioId).filter(Boolean))) as string[];
  const podiosPorTorneio = await torneioResultadosService.listarPodiosPorTorneioIds(torneioIds);

  const partidasConcluidas = minhasPartidas.filter((item) => STATUS_CONCLUIDOS.has(item.status));
  const vitorias = partidasConcluidas.filter((item) => {
    const minhaEquipeId = minhasEquipesIds.includes(item.equipeAId) ? item.equipeAId : item.equipeBId;
    return item.vencedorId && item.vencedorId === minhaEquipeId;
  }).length;
  const derrotas = Math.max(0, partidasConcluidas.length - vitorias);

  const categoriasResumo = inscricoesAprovadas.map((item) => {
    const partidasDaCategoria = minhasPartidas
      .filter(
        (partida) =>
          partida.torneioId === item.torneioId &&
          partida.categoriaId === item.categoriaId &&
          (partida.equipeAId === item.equipeId || partida.equipeBId === item.equipeId)
      )
      .sort((a, b) => obterTimestampReferencia(b) - obterTimestampReferencia(a));

    const melhorPartida = partidasDaCategoria.reduce<typeof partidasDaCategoria[number] | null>((acc, atual) => {
      if (!acc) return atual;
      const diffFase = obterPesoFase(atual.fase) - obterPesoFase(acc.fase);
      if (diffFase !== 0) return diffFase > 0 ? atual : acc;
      return obterTimestampReferencia(atual) > obterTimestampReferencia(acc) ? atual : acc;
    }, null);

    const partidasConcluidasCategoria = partidasDaCategoria.filter((partida) => STATUS_CONCLUIDOS.has(partida.status));
    const vitoriasCategoria = partidasConcluidasCategoria.filter((partida) => partida.vencedorId === item.equipeId).length;
    const derrotasCategoria = Math.max(0, partidasConcluidasCategoria.length - vitoriasCategoria);
    const podioCategoria = (podiosPorTorneio.get(item.torneioId) ?? []).find((podio) => podio.categoriaId === item.categoriaId);
    const medalha =
      !podioCategoria
        ? null
        : item.equipeId === podioCategoria.campeaoEquipeId
          ? "OURO"
          : item.equipeId === podioCategoria.viceEquipeId
            ? "PRATA"
            : null;
    const destaque = medalha === "OURO" ? "CAMPEAO" : medalha === "PRATA" ? "FINALISTA" : null;

    return {
      inscricaoId: item.inscricaoId,
      torneioId: item.torneioId,
      categoriaId: item.categoriaId,
      categoriaNome: item.categoriaNome,
      equipe: {
        id: item.equipeId,
        nome: nomesEquipes.get(item.equipeId) ?? "Dupla",
        atletas: atletasPorEquipe.get(item.equipeId) ?? [],
      },
      faseAlcancada: melhorPartida?.fase ?? null,
      faseLabel: melhorPartida?.fase ? obterLabelFase(melhorPartida.fase) : "Inscricao aprovada",
      destaque,
      medalha,
      vitorias: vitoriasCategoria,
      derrotas: derrotasCategoria,
      totalPartidas: partidasConcluidasCategoria.length,
      ultimoJogoEm: melhorPartida ? normalizarData(melhorPartida.finalizadoEm || melhorPartida.dataHorario || melhorPartida.criadoEm) : null,
      dataInscricao: normalizarData(item.dataInscricao),
    };
  });

  const titulos = categoriasResumo.filter((item) => item.medalha === "OURO").length;
  const vices = categoriasResumo.filter((item) => item.medalha === "PRATA").length;
  const finais = titulos + vices;

  const torneiosAgrupados = new Map<
    string,
    {
      torneio: {
        id: string;
        nome: string;
        slug: string;
        status: string;
        dataInicio: string | null;
        dataFim: string | null;
        local: string | null;
      };
      categorias: typeof categoriasResumo;
      referencia: number;
    }
  >();

  for (const item of inscricoesAprovadas) {
    const resumoCategoria = categoriasResumo.find((categoria) => categoria.inscricaoId === item.inscricaoId);
    if (!resumoCategoria) continue;

    const referencia = Math.max(
      new Date(item.torneioDataFim || item.torneioDataInicio || item.dataInscricao || 0).getTime() || 0,
      resumoCategoria.ultimoJogoEm ? new Date(resumoCategoria.ultimoJogoEm).getTime() : 0
    );

    const atual = torneiosAgrupados.get(item.torneioId);
    if (!atual) {
      torneiosAgrupados.set(item.torneioId, {
        torneio: {
          id: item.torneioId,
          nome: item.torneioNome,
          slug: item.torneioSlug,
          status: item.torneioStatus,
          dataInicio: normalizarData(item.torneioDataInicio),
          dataFim: normalizarData(item.torneioDataFim),
          local: item.torneioLocal ?? null,
        },
        categorias: [resumoCategoria],
        referencia,
      });
      continue;
    }

    atual.categorias.push(resumoCategoria);
    atual.referencia = Math.max(atual.referencia, referencia);
  }

  const ultimoTorneio = Array.from(torneiosAgrupados.values())
    .sort((a, b) => b.referencia - a.referencia)
    .map((item) => ({
      torneio: item.torneio,
      categorias: item.categorias.sort((a, b) => {
        const destaqueA = a.destaque === "CAMPEAO" ? 2 : a.destaque === "FINALISTA" ? 1 : 0;
        const destaqueB = b.destaque === "CAMPEAO" ? 2 : b.destaque === "FINALISTA" ? 1 : 0;
        if (destaqueA !== destaqueB) return destaqueB - destaqueA;
        const fase = obterPesoFase(b.faseAlcancada) - obterPesoFase(a.faseAlcancada);
        if (fase !== 0) return fase;
        return (b.ultimoJogoEm ? new Date(b.ultimoJogoEm).getTime() : 0) - (a.ultimoJogoEm ? new Date(a.ultimoJogoEm).getTime() : 0);
      }),
    }))[0] ?? null;

  const headToHead = oponente
    ? (() => {
        const historico = minhasPartidas
          .filter((partida) => {
            const euNoLadoA = minhasEquipesIds.includes(partida.equipeAId);
            const euNoLadoB = minhasEquipesIds.includes(partida.equipeBId);
            const oponenteNoLadoA = equipesOponenteIds.includes(partida.equipeAId);
            const oponenteNoLadoB = equipesOponenteIds.includes(partida.equipeBId);
            return (euNoLadoA && oponenteNoLadoB) || (euNoLadoB && oponenteNoLadoA);
          })
          .sort((a, b) => obterTimestampReferencia(b) - obterTimestampReferencia(a))
          .map((partida) => {
            const meuTimeId = minhasEquipesIds.includes(partida.equipeAId) ? partida.equipeAId : partida.equipeBId;
            const oponenteTimeId = meuTimeId === partida.equipeAId ? partida.equipeBId : partida.equipeAId;
            const resultado =
              !partida.vencedorId ? null : partida.vencedorId === meuTimeId ? "VITORIA" : "DERROTA";

            return {
              id: partida.id,
              dataReferencia: normalizarData(partida.finalizadoEm || partida.dataHorario || partida.criadoEm),
              torneio: {
                id: partida.torneioId,
                nome: partida.torneioNome,
                slug: partida.torneioSlug,
                status: partida.torneioStatus,
                dataInicio: normalizarData(partida.torneioDataInicio),
                dataFim: normalizarData(partida.torneioDataFim),
              },
              categoria: {
                id: partida.categoriaId,
                nome: partida.categoriaNome,
              },
              fase: partida.fase,
              faseLabel: obterLabelFase(partida.fase),
              status: partida.status,
              resultado,
              meuTime: {
                id: meuTimeId,
                nome: nomesEquipes.get(meuTimeId) ?? "Dupla",
                atletas: atletasPorEquipe.get(meuTimeId) ?? [],
              },
              oponenteTime: {
                id: oponenteTimeId,
                nome: nomesEquipes.get(oponenteTimeId) ?? "Dupla",
                atletas: atletasPorEquipe.get(oponenteTimeId) ?? [],
              },
              placar: {
                a: partida.placarA,
                b: partida.placarB,
                detalhes: partida.detalhesPlacar ?? [],
              },
            };
          });

        const historicoConcluido = historico.filter((item) => item.resultado);
        const vitoriasDiretas = historicoConcluido.filter((item) => item.resultado === "VITORIA").length;
        const derrotasDiretas = historicoConcluido.filter((item) => item.resultado === "DERROTA").length;

        return {
          oponente,
          resumo: {
            confrontos: historico.length,
            confrontosConcluidos: historicoConcluido.length,
            vitorias: vitoriasDiretas,
            derrotas: derrotasDiretas,
            ultimos5: historicoConcluido.slice(0, 5).map((item) => (item.resultado === "VITORIA" ? "V" : "D")),
          },
          historico,
        };
      })()
    : null;

  return NextResponse.json(
    {
      atleta: obterResumoAtleta(meuAtleta),
      resumo: {
        torneios: torneiosAgrupados.size,
        categorias: categoriasResumo.length,
        partidas: partidasConcluidas.length,
        vitorias,
        derrotas,
        aproveitamento: partidasConcluidas.length > 0 ? Math.round((vitorias / partidasConcluidas.length) * 100) : null,
        finais,
        titulos,
        vices,
      },
      ultimoTorneio: ultimoTorneio
        ? {
            torneio: ultimoTorneio.torneio,
            melhorResultado: ultimoTorneio.categorias[0] ?? null,
            categorias: ultimoTorneio.categorias,
          }
        : null,
      headToHead,
    },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
