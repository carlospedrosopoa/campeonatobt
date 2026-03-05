import { db } from "@/db";
import { esportes } from "@/db/schema";
import { eq } from "drizzle-orm";

export class EsportesService {
  async listarTodos() {
    return await db.select().from(esportes);
  }

  async buscarPorSlug(slug: string) {
    const resultado = await db.select().from(esportes).where(eq(esportes.slug, slug)).limit(1);
    return resultado[0] || null;
  }

  async criar(nome: string, slug: string) {
    const [novoEsporte] = await db.insert(esportes).values({
      nome,
      slug
    }).returning();
    return novoEsporte;
  }
}

export const esportesService = new EsportesService();
