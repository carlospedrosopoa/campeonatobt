import { db } from "@/db";
import { arenas } from "@/db/schema";
import { eq } from "drizzle-orm";

export class ArenasService {
  async listarPorTorneio(torneioId: string) {
    return db.select().from(arenas).where(eq(arenas.torneioId, torneioId));
  }

  async criar(params: { torneioId: string; nome: string }) {
    const [row] = await db
      .insert(arenas)
      .values({
        torneioId: params.torneioId,
        nome: params.nome.trim(),
      })
      .returning();
    return row;
  }

  async atualizar(params: { id: string; torneioId: string; nome: string }) {
    const [row] = await db
      .update(arenas)
      .set({ nome: params.nome.trim() })
      .where(eq(arenas.id, params.id))
      .returning();
    if (!row || row.torneioId !== params.torneioId) return null;
    return row;
  }

  async excluir(params: { id: string; torneioId: string }) {
    const [row] = await db.delete(arenas).where(eq(arenas.id, params.id)).returning();
    if (!row || row.torneioId !== params.torneioId) return null;
    return row;
  }
}

export const arenasService = new ArenasService();

