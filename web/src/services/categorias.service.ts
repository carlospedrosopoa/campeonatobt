import { db } from "@/db";
import { categorias } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { slugify } from "@/lib/utils";

export type CriarCategoriaDTO = {
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao?: string | number | null;
  vagasMaximas?: number | null;
};

export type AtualizarCategoriaDTO = {
  nome?: string;
  genero?: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao?: string | number | null;
  vagasMaximas?: number | null;
};

export class CategoriasService {
  async listarPorTorneio(torneioId: string) {
    return await db.select()
      .from(categorias)
      .where(eq(categorias.torneioId, torneioId))
      .orderBy(asc(categorias.nome));
  }

  async buscarPorId(id: string) {
    const resultado = await db.select().from(categorias).where(eq(categorias.id, id)).limit(1);
    return resultado[0] || null;
  }

  async buscarPorSlug(torneioId: string, slug: string) {
    const resultado = await db
      .select()
      .from(categorias)
      .where(and(eq(categorias.torneioId, torneioId), eq(categorias.slug, slug)))
      .limit(1);
    return resultado[0] || null;
  }

  async criar(dados: CriarCategoriaDTO) {
    const slug = slugify(dados.nome);
    
    // TODO: Verificar unicidade do slug e adicionar sufixo se necessário
    // Por enquanto, deixaremos o banco retornar erro de constraint unique

    const [nova] = await db
      .insert(categorias)
      .values({
        torneioId: dados.torneioId,
        nome: dados.nome,
        slug: slug,
        genero: dados.genero,
        valorInscricao:
          dados.valorInscricao === undefined || dados.valorInscricao === null
            ? undefined
            : String(dados.valorInscricao),
        vagasMaximas: dados.vagasMaximas ?? undefined,
      })
      .returning();
    return nova;
  }

  async atualizar(id: string, dados: AtualizarCategoriaDTO) {
    const dadosParaAtualizar: Partial<typeof categorias.$inferInsert> = {
      genero: dados.genero ?? undefined,
      valorInscricao:
        dados.valorInscricao === undefined
          ? undefined
          : dados.valorInscricao === null
            ? null
            : String(dados.valorInscricao),
      vagasMaximas: dados.vagasMaximas === undefined ? undefined : dados.vagasMaximas,
    };

    if (dados.nome) {
      dadosParaAtualizar.nome = dados.nome;
      dadosParaAtualizar.slug = slugify(dados.nome);
    }

    const [atualizada] = await db
      .update(categorias)
      .set(dadosParaAtualizar)
      .where(eq(categorias.id, id))
      .returning();
    return atualizada;
  }

  async excluir(id: string) {
    const [excluida] = await db.delete(categorias).where(eq(categorias.id, id)).returning();
    return excluida ?? null;
  }
}

export const categoriasService = new CategoriasService();
