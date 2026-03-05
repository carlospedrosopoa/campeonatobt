import { db } from "@/db";
import { equipeIntegrantes, equipes, usuarios } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

function firstName(full: string) {
  const trimmed = (full || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

function buildDisplayName(equipeNome: string | null, atletas: string[]) {
  const nome = (equipeNome || "").trim();
  if (nome) return nome;
  const nomes = atletas.map(firstName).filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (nomes.length === 0) return "Dupla";
  return nomes.join("/");
}

export class EquipesDisplayService {
  async mapNomesEquipes(equipeIds: string[]) {
    const ids = Array.from(new Set(equipeIds.filter(Boolean)));
    if (ids.length === 0) return new Map<string, string>();

    const equipesRows = await db.select({ id: equipes.id, nome: equipes.nome }).from(equipes).where(inArray(equipes.id, ids));
    const nomeEquipe = new Map(equipesRows.map((e) => [e.id, e.nome]));

    const integrantesRows = await db
      .select({ equipeId: equipeIntegrantes.equipeId, atletaNome: usuarios.nome })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, ids));

    const atletasPorEquipe = new Map<string, string[]>();
    for (const r of integrantesRows) {
      const list = atletasPorEquipe.get(r.equipeId) ?? [];
      list.push(r.atletaNome);
      atletasPorEquipe.set(r.equipeId, list);
    }

    const result = new Map<string, string>();
    for (const id of ids) {
      result.set(id, buildDisplayName(nomeEquipe.get(id) ?? null, atletasPorEquipe.get(id) ?? []));
    }
    return result;
  }
}

export const equipesDisplayService = new EquipesDisplayService();

