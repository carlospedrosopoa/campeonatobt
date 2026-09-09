import { db } from "@/db";
import { categorias, partidas } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

export type PodioCategoria = {
  torneioId: string;
  categoriaId: string;
  categoriaNome: string;
  categoriaSlug: string;
  campeaoEquipeId: string;
  campeaoNome: string;
  viceEquipeId: string;
  viceNome: string;
};

export class TorneioResultadosService {
  async listarPodiosPorTorneioIds(torneioIds: string[]) {
    const ids = Array.from(new Set(torneioIds.filter(Boolean)));
    const result = new Map<string, PodioCategoria[]>();
    if (ids.length === 0) return result;

    const finais = await db
      .select({
        torneioId: partidas.torneioId,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        categoriaSlug: categorias.slug,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        vencedorId: partidas.vencedorId,
        finalizadoEm: partidas.finalizadoEm,
        criadoEm: partidas.criadoEm,
      })
      .from(partidas)
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .where(
        and(
          inArray(partidas.torneioId, ids),
          eq(partidas.fase, "FINAL"),
          inArray(partidas.status, ["FINALIZADA", "WO"] as any)
        )
      )
      .orderBy(desc(partidas.finalizadoEm), desc(partidas.criadoEm));

    const finaisValidas = finais.filter(
      (item) => item.vencedorId && item.equipeAId && item.equipeBId && item.categoriaId && item.torneioId
    );
    if (finaisValidas.length === 0) return result;

    const categoriaIds = Array.from(new Set(finaisValidas.map((i) => i.categoriaId).filter(Boolean))) as string[];

    const equipeIdsPorCategoria = new Map<string, string[]>();
    for (const item of finaisValidas) {
      if (!item.categoriaId) continue;
      const list = equipeIdsPorCategoria.get(item.categoriaId) ?? [];
      if (item.equipeAId && !list.includes(item.equipeAId)) list.push(item.equipeAId);
      if (item.equipeBId && !list.includes(item.equipeBId)) list.push(item.equipeBId);
      equipeIdsPorCategoria.set(item.categoriaId, list);
    }

    const nomesPorCategoria = new Map<string, Map<string, string>>();
    for (const catId of categoriaIds) {
      const eqs = equipeIdsPorCategoria.get(catId) ?? [];
      nomesPorCategoria.set(catId, await equipesDisplayService.mapNomesEquipes(eqs, { categoriaId: catId }));
    }

    const categoriasProcessadas = new Set<string>();
    for (const item of finaisValidas) {
      if (categoriasProcessadas.has(item.categoriaId)) continue;
      categoriasProcessadas.add(item.categoriaId);

      const nomesMap = nomesPorCategoria.get(item.categoriaId);

      const campeaoEquipeId = item.vencedorId!;
      const viceEquipeId = item.vencedorId === item.equipeAId ? item.equipeBId! : item.equipeAId!;
      const podio: PodioCategoria = {
        torneioId: item.torneioId,
        categoriaId: item.categoriaId,
        categoriaNome: item.categoriaNome,
        categoriaSlug: item.categoriaSlug,
        campeaoEquipeId,
        campeaoNome: nomesMap?.get(campeaoEquipeId) ?? "Dupla campea",
        viceEquipeId,
        viceNome: nomesMap?.get(viceEquipeId) ?? "Dupla vice-campea",
      };

      const atual = result.get(item.torneioId) ?? [];
      atual.push(podio);
      result.set(item.torneioId, atual);
    }

    for (const [torneioId, podios] of result.entries()) {
      result.set(
        torneioId,
        podios.sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome))
      );
    }

    return result;
  }

  async listarPodioPorTorneio(torneioId: string) {
    return (await this.listarPodiosPorTorneioIds([torneioId])).get(torneioId) ?? [];
  }
}

export const torneioResultadosService = new TorneioResultadosService();
