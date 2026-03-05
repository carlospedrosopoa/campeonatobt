import { db } from "@/db";
import { apoiadores } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export type CriarApoiadorDTO = {
  torneioId: string;
  nome: string;
  logoUrl?: string;
  slogan?: string;
  endereco?: string;
  latitude?: string;
  longitude?: string;
  siteUrl?: string;
};

export type AtualizarApoiadorDTO = Partial<Omit<CriarApoiadorDTO, "torneioId">>;

export class ApoiadoresService {
  async listarPorTorneio(torneioId: string) {
    return await db
      .select()
      .from(apoiadores)
      .where(eq(apoiadores.torneioId, torneioId))
      .orderBy(desc(apoiadores.criadoEm));
  }

  async buscarPorId(id: string) {
    const resultado = await db
      .select()
      .from(apoiadores)
      .where(eq(apoiadores.id, id))
      .limit(1);
    return resultado[0] || null;
  }

  async criar(dados: CriarApoiadorDTO) {
    const [novo] = await db
      .insert(apoiadores)
      .values({
        ...dados,
      })
      .returning();
    return novo;
  }

  async atualizar(id: string, dados: AtualizarApoiadorDTO) {
    const [atualizado] = await db
      .update(apoiadores)
      .set({
        ...dados,
        atualizadoEm: new Date(),
      })
      .where(eq(apoiadores.id, id))
      .returning();
    return atualizado ?? null;
  }

  async excluir(id: string) {
    const [excluido] = await db
      .delete(apoiadores)
      .where(eq(apoiadores.id, id))
      .returning();
    return excluido ?? null;
  }
}

export const apoiadoresService = new ApoiadoresService();
