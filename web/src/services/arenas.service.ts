import { db } from "@/db";
import { arenas } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export class ArenasService {
  async listarPorTorneio(torneioId: string) {
    return db.select().from(arenas).where(eq(arenas.torneioId, torneioId)).orderBy(asc(arenas.nome));
  }

  async criar(params: { torneioId: string; nome: string; pointId?: string | null; logoUrl?: string | null }) {
    const [row] = await db
      .insert(arenas)
      .values({
        torneioId: params.torneioId,
        nome: params.nome.trim(),
        pointId: params.pointId ?? null,
        logoUrl: params.logoUrl ?? null,
      })
      .returning();
    return row;
  }

  async sincronizarComPoints(params: {
    torneioId: string;
    points: Array<{ id: string; nome: string; logoUrl?: string | null }>;
  }) {
    if (!params.points.length) return;
    await db
      .insert(arenas)
      .values(
        params.points.map((point) => ({
          torneioId: params.torneioId,
          pointId: point.id,
          nome: point.nome.trim(),
          logoUrl: point.logoUrl ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: [arenas.torneioId, arenas.pointId],
        set: {
          nome: sql`excluded.nome`,
          logoUrl: sql`excluded.logo_url`,
        },
      });
  }

  async atualizar(params: { id: string; torneioId: string; nome: string }) {
    const [row] = await db
      .update(arenas)
      .set({ nome: params.nome.trim() })
      .where(and(eq(arenas.id, params.id), eq(arenas.torneioId, params.torneioId)))
      .returning();
    if (!row) return null;
    return row;
  }

  async excluir(params: { id: string; torneioId: string }) {
    const [row] = await db.delete(arenas).where(and(eq(arenas.id, params.id), eq(arenas.torneioId, params.torneioId))).returning();
    if (!row) return null;
    return row;
  }
}

export const arenasService = new ArenasService();
