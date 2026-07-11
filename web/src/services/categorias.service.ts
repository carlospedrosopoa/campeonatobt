import { db } from "@/db";
import {
  categoriaConfiguracoes,
  categorias,
  equipeIntegrantes,
  equipes,
  grupoEquipes,
  grupos,
  inscricoes,
  partidas,
  placarSubmissoes,
  rodadas,
} from "@/db/schema";
import { eq, asc, and, sql, inArray, or } from "drizzle-orm";
import { slugify } from "@/lib/utils";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { inscricoesService } from "@/services/inscricoes.service";

export type CriarCategoriaDTO = {
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao?: string | number | null;
  vagasMaximas?: number | null;
  dataHorario?: Date | null;
};

export type AtualizarCategoriaDTO = {
  nome?: string;
  genero?: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao?: string | number | null;
  vagasMaximas?: number | null;
  dataHorario?: Date | null;
};

export type ClonarCategoriaDTO = {
  torneioId: string;
  categoriaOrigemId: string;
  nome: string;
};

export class CategoriasService {
  async listarPorTorneio(torneioId: string) {
    return await db.select()
      .from(categorias)
      .where(eq(categorias.torneioId, torneioId))
      .orderBy(sql`${categorias.dataHorario} asc nulls last`, asc(categorias.nome));
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
        dataHorario: dados.dataHorario === undefined ? undefined : dados.dataHorario,
      })
      .returning();
    return nova;
  }

  async clonarComInscricoes(dados: ClonarCategoriaDTO) {
    const origem = await this.buscarPorId(dados.categoriaOrigemId);
    if (!origem || origem.torneioId !== dados.torneioId) {
      throw new Error("Categoria de origem inválida para o torneio");
    }

    const nome = dados.nome.trim();
    if (!nome) throw new Error("Informe o nome da nova categoria");

    const novaCategoria = await this.criar({
      torneioId: dados.torneioId,
      nome,
      genero: origem.genero,
      valorInscricao: origem.valorInscricao,
      vagasMaximas: origem.vagasMaximas,
      dataHorario: origem.dataHorario,
    });

    const configOrigem = await categoriaConfigService.obterOuDefault(origem.id);
    await categoriaConfigService.salvar(novaCategoria.id, configOrigem);

    const inscricoesOrigem = await inscricoesService.listarPorCategoria(origem.id);
    for (const inscricao of inscricoesOrigem) {
      const atletas = inscricao.equipe.atletas.slice(0, 2);
      if (atletas.length < 2) continue;

      const atletaA = atletas[0];
      const atletaB = atletas[1];
      const capitaoPosicao = inscricao.equipe.capitaoUsuarioId && inscricao.equipe.capitaoUsuarioId === atletaB.id ? "B" : "A";

      await inscricoesService.criar({
        torneioId: dados.torneioId,
        categoriaId: novaCategoria.id,
        equipeNome: inscricao.equipe.nome ?? undefined,
        capitaoPosicao,
        status: inscricao.status as "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA",
        atletaA: {
          nome: atletaA.nome,
          email: atletaA.email,
          telefone: atletaA.telefone ?? undefined,
          playnaquadraAtletaId: atletaA.playnaquadraAtletaId ?? null,
          fotoUrl: atletaA.fotoUrl ?? null,
          camisetaOpcao: atletaA.camisetaOpcao ?? null,
        },
        atletaB: {
          nome: atletaB.nome,
          email: atletaB.email,
          telefone: atletaB.telefone ?? undefined,
          playnaquadraAtletaId: atletaB.playnaquadraAtletaId ?? null,
          fotoUrl: atletaB.fotoUrl ?? null,
          camisetaOpcao: atletaB.camisetaOpcao ?? null,
        },
      });
    }

    return novaCategoria;
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
      dataHorario: dados.dataHorario === undefined ? undefined : dados.dataHorario,
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

  async excluirForcado(id: string) {
    return await db.transaction(async (tx) => {
      const categoria = await tx.select().from(categorias).where(eq(categorias.id, id)).limit(1);
      const atual = categoria[0] ?? null;
      if (!atual) return null;

      const partidasDaCategoria = await tx
        .select({
          id: partidas.id,
          equipeAId: partidas.equipeAId,
          equipeBId: partidas.equipeBId,
          vencedorId: partidas.vencedorId,
        })
        .from(partidas)
        .where(eq(partidas.categoriaId, id));

      const gruposDaCategoria = await tx
        .select({ id: grupos.id })
        .from(grupos)
        .where(eq(grupos.categoriaId, id));

      const inscricoesDaCategoria = await tx
        .select({ equipeId: inscricoes.equipeId })
        .from(inscricoes)
        .where(eq(inscricoes.categoriaId, id));

      const partidaIds = partidasDaCategoria.map((item) => item.id);
      const grupoIds = gruposDaCategoria.map((item) => item.id);
      const equipeIdsAfetados = Array.from(
        new Set(
          [
            ...inscricoesDaCategoria.map((item) => item.equipeId),
            ...partidasDaCategoria.flatMap((item) => [item.equipeAId, item.equipeBId, item.vencedorId]).filter(
              (value): value is string => Boolean(value)
            ),
          ].filter(Boolean)
        )
      );

      if (partidaIds.length > 0) {
        await tx.delete(placarSubmissoes).where(inArray(placarSubmissoes.partidaId, partidaIds));
      }

      await tx.delete(partidas).where(eq(partidas.categoriaId, id));

      if (grupoIds.length > 0) {
        await tx.delete(grupoEquipes).where(inArray(grupoEquipes.grupoId, grupoIds));
      }

      await tx.delete(grupos).where(eq(grupos.categoriaId, id));
      await tx.delete(rodadas).where(eq(rodadas.categoriaId, id));
      await tx.delete(categoriaConfiguracoes).where(eq(categoriaConfiguracoes.categoriaId, id));
      await tx.delete(inscricoes).where(eq(inscricoes.categoriaId, id));

      const [excluida] = await tx.delete(categorias).where(eq(categorias.id, id)).returning();

      for (const equipeId of equipeIdsAfetados) {
        const inscricaoRestante = await tx
          .select({ id: inscricoes.id })
          .from(inscricoes)
          .where(eq(inscricoes.equipeId, equipeId))
          .limit(1);

        const grupoEquipeRestante = await tx
          .select({ id: grupoEquipes.id })
          .from(grupoEquipes)
          .where(eq(grupoEquipes.equipeId, equipeId))
          .limit(1);

        const partidaRestante = await tx
          .select({ id: partidas.id })
          .from(partidas)
          .where(
            or(
              eq(partidas.equipeAId, equipeId),
              eq(partidas.equipeBId, equipeId),
              eq(partidas.vencedorId, equipeId)
            )
          )
          .limit(1);

        if (inscricaoRestante[0] || grupoEquipeRestante[0] || partidaRestante[0]) {
          continue;
        }

        await tx.delete(equipeIntegrantes).where(eq(equipeIntegrantes.equipeId, equipeId));
        await tx.delete(equipes).where(eq(equipes.id, equipeId));
      }

      return excluida ?? atual;
    });
  }
}

export const categoriasService = new CategoriasService();
