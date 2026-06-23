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

    const equipeIds = Array.from(
      new Set(
        finaisValidas.flatMap((item) => [item.equipeAId, item.equipeBId]).filter(Boolean)
      )
    ) as string[];
    const nomesEquipes = await equipesDisplayService.mapNomesEquipes(equipeIds);

    const categoriasProcessadas = new Set<string>();
    for (const item of finaisValidas) {
      if (categoriasProcessadas.has(item.categoriaId)) continue;
      categoriasProcessadas.add(item.categoriaId);

      const campeaoEquipeId = item.vencedorId!;
      const viceEquipeId = item.vencedorId === item.equipeAId ? item.equipeBId! : item.equipeAId!;
      const podio: PodioCategoria = {
        torneioId: item.torneioId,
        categoriaId: item.categoriaId,
        categoriaNome: item.categoriaNome,
        categoriaSlug: item.categoriaSlug,
        campeaoEquipeId,
        campeaoNome: nomesEquipes.get(campeaoEquipeId) ?? "Dupla campea",
        viceEquipeId,
        viceNome: nomesEquipes.get(viceEquipeId) ?? "Dupla vice-campea",
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
