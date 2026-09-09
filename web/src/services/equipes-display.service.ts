import { db } from "@/db";
import { equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, usuarios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

function primeiroEUltimoNome(full: string) {
  const trimmed = (full || "").trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

function buildDisplayName(equipeNome: string | null, atletas: string[]) {
  const nome = (equipeNome || "").trim();
  if (nome) return nome;
  const nomes = atletas.map(primeiroEUltimoNome).filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (nomes.length === 0) return "Dupla";
  return nomes.join("/");
}

export type AtletaDisplay = { id: string; nome: string; fotoUrl: string | null; playnaquadraAtletaId: string | null };

type EquipeDisplayOpts = {
  categoriaId?: string | string[];
};

function buildCategoriaFilter(value?: string | string[]) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const ids = Array.from(new Set(value.filter(Boolean)));
    return ids.length > 0 ? inArray(inscricoes.categoriaId, ids) : undefined;
  }
  return eq(inscricoes.categoriaId, value);
}

export class EquipesDisplayService {
  private async carregarNomeEquipes(equipeIds: string[]): Promise<Map<string, string | null>> {
    const rows = await db
      .select({ id: equipes.id, nome: equipes.nome })
      .from(equipes)
      .where(inArray(equipes.id, equipeIds));
    return new Map(rows.map((e) => [e.id, e.nome]));
  }

  private async carregarAtletasPorInscricao(
    equipeIds: string[],
    categoriaId?: string | string[]
  ): Promise<Map<string, AtletaDisplay[]> | null> {
    const filterCategoria = buildCategoriaFilter(categoriaId);
    if (!filterCategoria) return null;

    const rows = await db
      .select({
        equipeId: equipes.id,
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaFotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(equipes)
      .innerJoin(inscricoes, and(eq(inscricoes.equipeId, equipes.id), filterCategoria))
      .innerJoin(inscricaoPagamentos, eq(inscricaoPagamentos.inscricaoId, inscricoes.id))
      .innerJoin(usuarios, eq(usuarios.id, inscricaoPagamentos.usuarioId))
      .where(inArray(equipes.id, equipeIds));

    if (rows.length === 0) return null;

    const map = new Map<string, AtletaDisplay[]>();
    for (const r of rows) {
      const key = r.equipeId;
      const list = map.get(key) ?? [];
      list.push({
        id: r.atletaId,
        nome: r.atletaNome,
        fotoUrl: r.atletaFotoUrl ?? null,
        playnaquadraAtletaId: r.playnaquadraAtletaId ?? null,
      });
      map.set(key, list);
    }
    return map;
  }

  private async carregarAtletasPorIntegrantes(equipeIds: string[]): Promise<Map<string, AtletaDisplay[]>> {
    const rows = await db
      .select({
        equipeId: equipeIntegrantes.equipeId,
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaFotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));

    const map = new Map<string, AtletaDisplay[]>();
    for (const r of rows) {
      const list = map.get(r.equipeId) ?? [];
      list.push({
        id: r.atletaId,
        nome: r.atletaNome,
        fotoUrl: r.atletaFotoUrl ?? null,
        playnaquadraAtletaId: r.playnaquadraAtletaId ?? null,
      });
      map.set(r.equipeId, list);
    }
    return map;
  }

  private async obterAtletasPorEquipe(
    equipeIds: string[],
    opts: EquipeDisplayOpts
  ): Promise<Map<string, AtletaDisplay[]>> {
    const ids = Array.from(new Set(equipeIds.filter(Boolean)));
    if (ids.length === 0) return new Map();

    const viaInscricao = await this.carregarAtletasPorInscricao(ids, opts.categoriaId);
    if (viaInscricao && viaInscricao.size > 0) {
      const integrantesFallback = await this.carregarAtletasPorIntegrantes(ids);
      const result = new Map<string, AtletaDisplay[]>();
      for (const id of ids) {
        result.set(id, viaInscricao.get(id) ?? integrantesFallback.get(id) ?? []);
      }
      return result;
    }
    return this.carregarAtletasPorIntegrantes(ids);
  }

  async mapNomesEquipes(equipeIds: string[], opts: EquipeDisplayOpts = {}) {
    const ids = Array.from(new Set(equipeIds.filter(Boolean)));
    if (ids.length === 0) return new Map<string, string>();

    const [nomeEquipeMap, atletasPorEquipe] = await Promise.all([
      this.carregarNomeEquipes(ids),
      this.obterAtletasPorEquipe(ids, opts),
    ]);

    const result = new Map<string, string>();
    for (const id of ids) {
      const atletasNomes = (atletasPorEquipe.get(id) ?? []).map((a) => a.nome);
      result.set(id, buildDisplayName(nomeEquipeMap.get(id) ?? null, atletasNomes));
    }
    return result;
  }

  async mapAtletasEquipes(
    equipeIds: string[],
    opts: EquipeDisplayOpts = {}
  ): Promise<Map<string, AtletaDisplay[]>> {
    return this.obterAtletasPorEquipe(equipeIds, opts);
  }
}

export const equipesDisplayService = new EquipesDisplayService();

