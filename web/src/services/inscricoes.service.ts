import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricoes, usuarios } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export type CriarInscricaoDTO = {
  torneioId: string;
  categoriaId: string;
  equipeNome?: string;
  atletaA: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null };
  atletaB: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null };
  status?: "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA";
};

export class InscricoesService {
  async listarPorCategoria(categoriaId: string) {
    const rows = await db
      .select({
        inscricaoId: inscricoes.id,
        status: inscricoes.status,
        dataInscricao: inscricoes.dataInscricao,
        equipeId: equipes.id,
        equipeNome: equipes.nome,
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaEmail: usuarios.email,
        atletaTelefone: usuarios.telefone,
        atletaFotoUrl: usuarios.fotoUrl,
      })
      .from(inscricoes)
      .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(eq(inscricoes.categoriaId, categoriaId));

    const map = new Map<
      string,
      {
        id: string;
        status: string;
        dataInscricao: Date;
        equipe: { id: string; nome: string | null; atletas: { id: string; nome: string; email: string; telefone: string | null; fotoUrl: string | null }[] };
      }
    >();

    for (const r of rows) {
      const key = r.inscricaoId;
      const current = map.get(key);
      if (!current) {
        map.set(key, {
          id: r.inscricaoId,
          status: r.status,
          dataInscricao: r.dataInscricao,
          equipe: {
            id: r.equipeId,
            nome: r.equipeNome,
            atletas: [
              { id: r.atletaId, nome: r.atletaNome, email: r.atletaEmail, telefone: r.atletaTelefone ?? null, fotoUrl: r.atletaFotoUrl ?? null },
            ],
          },
        });
      } else {
        current.equipe.atletas.push({ id: r.atletaId, nome: r.atletaNome, email: r.atletaEmail, telefone: r.atletaTelefone ?? null, fotoUrl: r.atletaFotoUrl ?? null });
      }
    }

    const result = Array.from(map.values());
    for (const item of result) {
      const nomeAtual = (item.equipe.nome || "").trim();
      if (!nomeAtual) {
        const nomes = item.equipe.atletas
          .map((a) => (a.nome || "").trim().split(/\s+/)[0])
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        item.equipe.nome = nomes.length > 0 ? nomes.join("/") : "Dupla";
      }
    }

    return result.sort((a, b) => a.dataInscricao.getTime() - b.dataInscricao.getTime());
  }

  async criar(dados: CriarInscricaoDTO) {
    const cat = await db.select().from(categorias).where(eq(categorias.id, dados.categoriaId)).limit(1);
    const categoria = cat[0];
    if (!categoria || categoria.torneioId !== dados.torneioId) {
      throw new Error("Categoria inválida para o torneio");
    }

    const atletaAEmail = dados.atletaA.email.trim().toLowerCase();
    const atletaBEmail = dados.atletaB.email.trim().toLowerCase();

    if (!atletaAEmail || !atletaBEmail) throw new Error("Emails dos atletas são obrigatórios");
    if (atletaAEmail === atletaBEmail) throw new Error("Atletas precisam ser diferentes");

    const atletaAId = await this.upsertAtleta({
      nome: dados.atletaA.nome.trim(),
      email: atletaAEmail,
      telefone: dados.atletaA.telefone?.trim(),
      playnaquadraAtletaId: dados.atletaA.playnaquadraAtletaId ?? null,
      fotoUrl: dados.atletaA.fotoUrl ?? null,
    });

    const atletaBId = await this.upsertAtleta({
      nome: dados.atletaB.nome.trim(),
      email: atletaBEmail,
      telefone: dados.atletaB.telefone?.trim(),
      playnaquadraAtletaId: dados.atletaB.playnaquadraAtletaId ?? null,
      fotoUrl: dados.atletaB.fotoUrl ?? null,
    });

    if (atletaAId === atletaBId) throw new Error("Atletas precisam ser diferentes");

    const conflito = await db
      .select({ inscricaoId: inscricoes.id })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .where(and(eq(inscricoes.categoriaId, dados.categoriaId), inArray(equipeIntegrantes.usuarioId, [atletaAId, atletaBId])))
      .limit(1);

    if (conflito.length > 0) {
      throw new Error("Um dos atletas já está inscrito nesta categoria");
    }

    const equipeIdExistente = await this.buscarEquipePorDupla(dados.torneioId, atletaAId, atletaBId);
    const equipeId = equipeIdExistente ?? (await this.criarEquipeComIntegrantes(dados.torneioId, dados.equipeNome?.trim(), atletaAId, atletaBId));

    const [novaInscricao] = await db
      .insert(inscricoes)
      .values({
        torneioId: dados.torneioId,
        categoriaId: dados.categoriaId,
        equipeId,
        status: dados.status ?? "APROVADA",
      })
      .returning();

    return novaInscricao;
  }

  async excluir(inscricaoId: string) {
    const [del] = await db.delete(inscricoes).where(eq(inscricoes.id, inscricaoId)).returning();
    return del ?? null;
  }

  private async upsertAtleta(dados: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null }) {
    if (dados.playnaquadraAtletaId) {
      const existingByPlay = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.playnaquadraAtletaId, dados.playnaquadraAtletaId))
        .limit(1);
      if (existingByPlay.length > 0) {
        const id = existingByPlay[0].id;
        await db
          .update(usuarios)
          .set({
            nome: dados.nome,
            email: dados.email,
            telefone: dados.telefone ?? null,
            ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
            atualizadoEm: new Date(),
          })
          .where(eq(usuarios.id, id));
        return id;
      }
    }

    const existing = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, dados.email)).limit(1);
    if (existing.length > 0) {
      const id = existing[0].id;
      await db
        .update(usuarios)
        .set({
          nome: dados.nome,
          telefone: dados.telefone ?? null,
          playnaquadraAtletaId: dados.playnaquadraAtletaId ?? null,
          ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, id));
      return id;
    }

    const [novo] = await db
      .insert(usuarios)
      .values({
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone ?? null,
        perfil: "ATLETA",
        playnaquadraAtletaId: dados.playnaquadraAtletaId ?? null,
        fotoUrl: dados.fotoUrl ?? null,
      })
      .returning();

    return novo.id;
  }

  private async buscarEquipePorDupla(torneioId: string, atletaAId: string, atletaBId: string) {
    const candidatos = await db
      .select({
        equipeId: equipeIntegrantes.equipeId,
        cnt: sql<number>`count(*)`,
      })
      .from(equipeIntegrantes)
      .innerJoin(equipes, eq(equipeIntegrantes.equipeId, equipes.id))
      .where(and(eq(equipes.torneioId, torneioId), inArray(equipeIntegrantes.usuarioId, [atletaAId, atletaBId])))
      .groupBy(equipeIntegrantes.equipeId)
      .having(sql`count(*) = 2`)
      .limit(1);

    return candidatos[0]?.equipeId ?? null;
  }

  private async criarEquipeComIntegrantes(torneioId: string, nome: string | undefined, atletaAId: string, atletaBId: string) {
    const [equipe] = await db
      .insert(equipes)
      .values({
        torneioId,
        nome: nome || null,
      })
      .returning();

    await db.insert(equipeIntegrantes).values([
      { equipeId: equipe.id, usuarioId: atletaAId },
      { equipeId: equipe.id, usuarioId: atletaBId },
    ]);

    return equipe.id;
  }
}

export const inscricoesService = new InscricoesService();
