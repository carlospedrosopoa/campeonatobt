import { db } from "@/db";
import { categorias, equipeIntegrantes, partidas, torneios, usuarios } from "@/db/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

const STATUS_CONCLUIDOS = new Set(["FINALIZADA", "WO"]);

const FASE_LABEL: Record<string, string> = {
  GRUPOS: "Fase de grupos",
  OITAVAS: "Oitavas",
  QUARTAS: "Quartas",
  SEMI: "Semifinal",
  FINAL: "Final",
};

type AtletaResumo = {
  id: string;
  nome: string;
  fotoUrl: string | null;
  playnaquadraAtletaId: string | null;
};

type TimeResumo = {
  id: string;
  nome: string;
  atletas: AtletaResumo[];
};

type PartidaHistorica = {
  id: string;
  torneioId: string;
  torneioNome: string;
  torneioSlug: string;
  torneioStatus: string;
  torneioDataInicio: Date | string | null;
  torneioDataFim: Date | string | null;
  categoriaId: string;
  categoriaNome: string;
  equipeAId: string;
  equipeBId: string;
  vencedorId: string | null;
  fase: string;
  status: string;
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }> | null;
  dataHorario: Date | string | null;
  finalizadoEm: Date | string | null;
  criadoEm: Date | string | null;
};

function normalizarData(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function obterLabelFase(fase?: string | null) {
  if (!fase) return "Inscrição aprovada";
  return FASE_LABEL[fase] ?? fase;
}

function obterTimestampReferencia(item: {
  finalizadoEm?: Date | string | null;
  dataHorario?: Date | string | null;
  criadoEm?: Date | string | null;
}) {
  return new Date(item.finalizadoEm || item.dataHorario || item.criadoEm || 0).getTime() || 0;
}

function ordenarHistoricoDesc<T extends { finalizadoEm?: Date | string | null; dataHorario?: Date | string | null; criadoEm?: Date | string | null }>(items: T[]) {
  return items.slice().sort((a, b) => obterTimestampReferencia(b) - obterTimestampReferencia(a));
}

function chaveAtletas(atletas: Array<{ id: string }>) {
  return atletas
    .map((atleta) => atleta.id)
    .filter(Boolean)
    .sort()
    .join("|");
}

function inverterDetalhesPlacar(
  detalhes?: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }> | null
) {
  return (detalhes ?? []).map((set) => ({
    set: set.set,
    a: set.b,
    b: set.a,
    ...(set.tiebreak ? { tiebreak: true, tbA: set.tbB, tbB: set.tbA } : {}),
  }));
}

function parceiroDoAtleta(time: TimeResumo, atletaId: string) {
  return time.atletas.find((atleta) => atleta.id !== atletaId) ?? null;
}

function nomesUnicos(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

export class PartidaHeadToHeadService {
  async gerarPorPartida(params: { partidaId: string; torneioId: string; categoriaId?: string | null }) {
    const partidaRows = await db
      .select({
        id: partidas.id,
        torneioId: partidas.torneioId,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        torneioNome: torneios.nome,
        torneioSlug: torneios.slug,
        torneioStatus: torneios.status,
        torneioDataInicio: torneios.dataInicio,
        torneioDataFim: torneios.dataFim,
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
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
      .where(
        and(
          eq(partidas.id, params.partidaId),
          eq(partidas.torneioId, params.torneioId),
          params.categoriaId ? eq(partidas.categoriaId, params.categoriaId) : undefined
        )
      )
      .limit(1);

    const partidaAtual = partidaRows[0];
    if (!partidaAtual) {
      throw new Error("Partida não encontrada");
    }

    const equipesAtuaisIds = [partidaAtual.equipeAId, partidaAtual.equipeBId];
    const [nomesEquipesAtuais, integrantesAtuaisRows] = await Promise.all([
      equipesDisplayService.mapNomesEquipes(equipesAtuaisIds),
      db
        .select({
          equipeId: equipeIntegrantes.equipeId,
          atletaId: usuarios.id,
          atletaNome: usuarios.nome,
          fotoUrl: usuarios.fotoUrl,
          playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
        })
        .from(equipeIntegrantes)
        .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
        .where(inArray(equipeIntegrantes.equipeId, equipesAtuaisIds)),
    ]);

    const atletasPorEquipeAtual = new Map<string, AtletaResumo[]>();
    for (const row of integrantesAtuaisRows) {
      const lista = atletasPorEquipeAtual.get(row.equipeId) ?? [];
      lista.push({
        id: row.atletaId,
        nome: row.atletaNome,
        fotoUrl: row.fotoUrl ?? null,
        playnaquadraAtletaId: row.playnaquadraAtletaId ?? null,
      });
      atletasPorEquipeAtual.set(row.equipeId, lista);
    }

    const duplaAAtual: TimeResumo = {
      id: partidaAtual.equipeAId,
      nome: nomesEquipesAtuais.get(partidaAtual.equipeAId) ?? "Dupla A",
      atletas: atletasPorEquipeAtual.get(partidaAtual.equipeAId) ?? [],
    };
    const duplaBAtual: TimeResumo = {
      id: partidaAtual.equipeBId,
      nome: nomesEquipesAtuais.get(partidaAtual.equipeBId) ?? "Dupla B",
      atletas: atletasPorEquipeAtual.get(partidaAtual.equipeBId) ?? [],
    };

    if (duplaAAtual.atletas.length === 0 || duplaBAtual.atletas.length === 0) {
      throw new Error("Não foi possível localizar os atletas da partida");
    }

    const atletaIdsRelevantes = Array.from(new Set([...duplaAAtual.atletas, ...duplaBAtual.atletas].map((atleta) => atleta.id)));

    const equipesRelacionadasRows = await db
      .select({ equipeId: equipeIntegrantes.equipeId })
      .from(equipeIntegrantes)
      .where(inArray(equipeIntegrantes.usuarioId, atletaIdsRelevantes));

    const equipesRelacionadasIds = Array.from(new Set(equipesRelacionadasRows.map((row) => row.equipeId).filter(Boolean))) as string[];

    const partidasHistoricas = equipesRelacionadasIds.length
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
          .where(
            and(
              or(inArray(partidas.equipeAId, equipesRelacionadasIds), inArray(partidas.equipeBId, equipesRelacionadasIds)),
              inArray(partidas.status, Array.from(STATUS_CONCLUIDOS) as Array<"FINALIZADA" | "WO">)
            )
          )
          .orderBy(desc(partidas.finalizadoEm), desc(partidas.dataHorario), desc(partidas.criadoEm))
      : [];

    const todasEquipesIds = Array.from(
      new Set(
        [
          ...equipesRelacionadasIds,
          ...partidasHistoricas.flatMap((partida) => [partida.equipeAId, partida.equipeBId]),
          duplaAAtual.id,
          duplaBAtual.id,
        ].filter(Boolean)
      )
    ) as string[];

    const [nomesEquipesTodas, integrantesRows] = await Promise.all([
      equipesDisplayService.mapNomesEquipes(todasEquipesIds),
      todasEquipesIds.length
        ? db
            .select({
              equipeId: equipeIntegrantes.equipeId,
              atletaId: usuarios.id,
              atletaNome: usuarios.nome,
              fotoUrl: usuarios.fotoUrl,
              playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
            })
            .from(equipeIntegrantes)
            .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
            .where(inArray(equipeIntegrantes.equipeId, todasEquipesIds))
        : Promise.resolve([]),
    ]);

    const atletasPorEquipe = new Map<string, AtletaResumo[]>();
    for (const row of integrantesRows) {
      const lista = atletasPorEquipe.get(row.equipeId) ?? [];
      lista.push({
        id: row.atletaId,
        nome: row.atletaNome,
        fotoUrl: row.fotoUrl ?? null,
        playnaquadraAtletaId: row.playnaquadraAtletaId ?? null,
      });
      atletasPorEquipe.set(row.equipeId, lista);
    }

    const obterTime = (equipeId: string): TimeResumo => ({
      id: equipeId,
      nome: nomesEquipesTodas.get(equipeId) ?? equipeId.slice(0, 8),
      atletas: atletasPorEquipe.get(equipeId) ?? [],
    });

    const chaveDuplaAAtual = chaveAtletas(duplaAAtual.atletas);
    const chaveDuplaBAtual = chaveAtletas(duplaBAtual.atletas);

    const historicoDuplas = ordenarHistoricoDesc(
      partidasHistoricas.filter((partida) => {
        const timeA = obterTime(partida.equipeAId);
        const timeB = obterTime(partida.equipeBId);
        const chaveA = chaveAtletas(timeA.atletas);
        const chaveB = chaveAtletas(timeB.atletas);
        return (chaveA === chaveDuplaAAtual && chaveB === chaveDuplaBAtual) || (chaveA === chaveDuplaBAtual && chaveB === chaveDuplaAAtual);
      })
    ).map((partida) => {
      const timeA = obterTime(partida.equipeAId);
      const timeB = obterTime(partida.equipeBId);
      const duplaAEstaNoLadoA = chaveAtletas(timeA.atletas) === chaveDuplaAAtual;
      const timeDuplaA = duplaAEstaNoLadoA ? timeA : timeB;
      const timeDuplaB = duplaAEstaNoLadoA ? timeB : timeA;
      const resultado = !partida.vencedorId
        ? null
        : partida.vencedorId === timeDuplaA.id
          ? "DUPLA_A"
          : "DUPLA_B";

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
        duplaA: timeDuplaA,
        duplaB: timeDuplaB,
        placar: duplaAEstaNoLadoA
          ? {
              a: partida.placarA,
              b: partida.placarB,
              detalhes: partida.detalhesPlacar ?? [],
            }
          : {
              a: partida.placarB,
              b: partida.placarA,
              detalhes: inverterDetalhesPlacar(partida.detalhesPlacar),
            },
      };
    });

    const historicoDuplasConcluido = historicoDuplas.filter((item) => item.resultado);
    const confrontosIndividuais = duplaAAtual.atletas.flatMap((atletaA) =>
      duplaBAtual.atletas.map((atletaB) => {
        const historico = ordenarHistoricoDesc(
          partidasHistoricas.filter((partida) => {
            const timeA = obterTime(partida.equipeAId);
            const timeB = obterTime(partida.equipeBId);
            const atletaANoLadoA = timeA.atletas.some((atleta) => atleta.id === atletaA.id);
            const atletaANoLadoB = timeB.atletas.some((atleta) => atleta.id === atletaA.id);
            const atletaBNoLadoA = timeA.atletas.some((atleta) => atleta.id === atletaB.id);
            const atletaBNoLadoB = timeB.atletas.some((atleta) => atleta.id === atletaB.id);
            return (atletaANoLadoA && atletaBNoLadoB) || (atletaANoLadoB && atletaBNoLadoA);
          })
        ).map((partida) => {
          const timeA = obterTime(partida.equipeAId);
          const timeB = obterTime(partida.equipeBId);
          const atletaAEstaNoLadoA = timeA.atletas.some((atleta) => atleta.id === atletaA.id);
          const ladoAtletaA = atletaAEstaNoLadoA ? timeA : timeB;
          const ladoAtletaB = atletaAEstaNoLadoA ? timeB : timeA;
          const resultado = !partida.vencedorId
            ? null
            : partida.vencedorId === ladoAtletaA.id
              ? "ATLETA_A"
              : "ATLETA_B";

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
            atletaAParceiro: parceiroDoAtleta(ladoAtletaA, atletaA.id),
            atletaBParceiro: parceiroDoAtleta(ladoAtletaB, atletaB.id),
            duplaAtletaA: ladoAtletaA,
            duplaAtletaB: ladoAtletaB,
            placar: atletaAEstaNoLadoA
              ? {
                  a: partida.placarA,
                  b: partida.placarB,
                  detalhes: partida.detalhesPlacar ?? [],
                }
              : {
                  a: partida.placarB,
                  b: partida.placarA,
                  detalhes: inverterDetalhesPlacar(partida.detalhesPlacar),
                },
          };
        });

        const historicoConcluido = historico.filter((item) => item.resultado);

        return {
          chave: `${atletaA.id}__${atletaB.id}`,
          atletaA,
          atletaB,
          resumo: {
            confrontos: historico.length,
            confrontosConcluidos: historicoConcluido.length,
            vitoriasAtletaA: historicoConcluido.filter((item) => item.resultado === "ATLETA_A").length,
            vitoriasAtletaB: historicoConcluido.filter((item) => item.resultado === "ATLETA_B").length,
            ultimos5: historicoConcluido.slice(0, 5).map((item) => (item.resultado === "ATLETA_A" ? "A" : "B")),
            parceirosAtletaA: nomesUnicos(historico.map((item) => item.atletaAParceiro?.nome)),
            parceirosAtletaB: nomesUnicos(historico.map((item) => item.atletaBParceiro?.nome)),
          },
          historico,
        };
      })
    );

    return {
      partida: {
        id: partidaAtual.id,
        fase: partidaAtual.fase,
        faseLabel: obterLabelFase(partidaAtual.fase),
        status: partidaAtual.status,
        torneio: {
          id: partidaAtual.torneioId,
          nome: partidaAtual.torneioNome,
          slug: partidaAtual.torneioSlug,
          status: partidaAtual.torneioStatus,
          dataInicio: normalizarData(partidaAtual.torneioDataInicio),
          dataFim: normalizarData(partidaAtual.torneioDataFim),
        },
        categoria: {
          id: partidaAtual.categoriaId,
          nome: partidaAtual.categoriaNome,
        },
        duplaA: duplaAAtual,
        duplaB: duplaBAtual,
      },
      confrontoDuplas: {
        resumo: {
          confrontos: historicoDuplas.length,
          confrontosConcluidos: historicoDuplasConcluido.length,
          vitoriasDuplaA: historicoDuplasConcluido.filter((item) => item.resultado === "DUPLA_A").length,
          vitoriasDuplaB: historicoDuplasConcluido.filter((item) => item.resultado === "DUPLA_B").length,
          ultimos5: historicoDuplasConcluido.slice(0, 5).map((item) => (item.resultado === "DUPLA_A" ? "A" : "B")),
        },
        historico: historicoDuplas,
      },
      confrontosIndividuais,
    };
  }
}
