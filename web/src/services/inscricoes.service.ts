import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export type CriarInscricaoDTO = {
  torneioId: string;
  categoriaId: string;
  equipeNome?: string;
  atletaA: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null };
  atletaB: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null };
  status?: "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA";
};

export type AtualizarInscricaoDTO = {
  torneioId: string;
  categoriaId: string;
  equipeNome?: string | null;
  atletaA: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null };
  atletaB: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null };
  status?: "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA";
};

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

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
        atletaPago: inscricaoPagamentos.pago,
        atletaPagamentoStatus: inscricaoPagamentos.status,
        atletaValorDevido: inscricaoPagamentos.valorDevido,
      })
      .from(inscricoes)
      .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .leftJoin(inscricaoPagamentos, and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, usuarios.id)))
      .where(eq(inscricoes.categoriaId, categoriaId));

    const map = new Map<
      string,
      {
        id: string;
        status: string;
        dataInscricao: Date;
        equipe: {
          id: string;
          nome: string | null;
          atletas: {
            id: string;
            nome: string;
            email: string;
            telefone: string | null;
            fotoUrl: string | null;
            pago: boolean;
            pagamentoStatus?: string;
            valorDevido?: string | null;
          }[];
        };
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
              {
                id: r.atletaId,
                nome: r.atletaNome,
                email: r.atletaEmail,
                telefone: r.atletaTelefone ?? null,
                fotoUrl: r.atletaFotoUrl ?? null,
                pagamentoStatus: r.atletaPagamentoStatus ?? (Boolean(r.atletaPago) ? "PAGO" : "PENDENTE"),
                pago: Boolean(r.atletaPago) || r.atletaPagamentoStatus === "PAGO",
                valorDevido: r.atletaValorDevido ?? null,
              },
            ],
          },
        });
      } else {
        current.equipe.atletas.push({
          id: r.atletaId,
          nome: r.atletaNome,
          email: r.atletaEmail,
          telefone: r.atletaTelefone ?? null,
          fotoUrl: r.atletaFotoUrl ?? null,
          pagamentoStatus: r.atletaPagamentoStatus ?? (Boolean(r.atletaPago) ? "PAGO" : "PENDENTE"),
          pago: Boolean(r.atletaPago) || r.atletaPagamentoStatus === "PAGO",
          valorDevido: r.atletaValorDevido ?? null,
        });
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

    const [torneioRow] = await db
      .select({
        valorPrimeiraInscricao: torneios.valorPrimeiraInscricao,
        valorInscricaoAdicional: torneios.valorInscricaoAdicional,
      })
      .from(torneios)
      .where(eq(torneios.id, dados.torneioId))
      .limit(1);

    const pagamentosPrevios = await db
      .select({
        usuarioId: inscricaoPagamentos.usuarioId,
        total: sql<number>`coalesce(count(*), 0)::int`,
      })
      .from(inscricaoPagamentos)
      .innerJoin(inscricoes, eq(inscricaoPagamentos.inscricaoId, inscricoes.id))
      .where(and(eq(inscricoes.torneioId, dados.torneioId), inArray(inscricaoPagamentos.usuarioId, [atletaAId, atletaBId])))
      .groupBy(inscricaoPagamentos.usuarioId);

    const prevMap = new Map<string, number>(pagamentosPrevios.map((p) => [p.usuarioId, Number(p.total || 0)]));

    const valorCategoria = categoria?.valorInscricao ?? null;
    const valorPrimeira = torneioRow?.valorPrimeiraInscricao ?? null;
    const valorAdicional = torneioRow?.valorInscricaoAdicional ?? null;
    const valorPara = (usuarioId: string) => {
      const jaTem = (prevMap.get(usuarioId) ?? 0) > 0;
      if (!jaTem) return valorPrimeira ?? valorCategoria ?? null;
      return valorAdicional ?? valorCategoria ?? null;
    };

    const [novaInscricao] = await db
      .insert(inscricoes)
      .values({
        torneioId: dados.torneioId,
        categoriaId: dados.categoriaId,
        equipeId,
        status: dados.status ?? "APROVADA",
      })
      .returning();

    await db
      .insert(inscricaoPagamentos)
      .values([
        { inscricaoId: novaInscricao.id, usuarioId: atletaAId, pago: false, valorDevido: valorPara(atletaAId) },
        { inscricaoId: novaInscricao.id, usuarioId: atletaBId, pago: false, valorDevido: valorPara(atletaBId) },
      ])
      .onConflictDoNothing();

    return novaInscricao;
  }

  async excluir(inscricaoId: string) {
    const [del] = await db.delete(inscricoes).where(eq(inscricoes.id, inscricaoId)).returning();
    return del ?? null;
  }

  async atualizar(inscricaoId: string, dados: AtualizarInscricaoDTO) {
    const insRow = await db
      .select({
        inscricaoId: inscricoes.id,
        torneioId: inscricoes.torneioId,
        categoriaId: inscricoes.categoriaId,
        equipeId: inscricoes.equipeId,
      })
      .from(inscricoes)
      .where(eq(inscricoes.id, inscricaoId))
      .limit(1);

    const ins = insRow[0];
    if (!ins) throw new Error("Inscrição não encontrada");
    if (ins.torneioId !== dados.torneioId || ins.categoriaId !== dados.categoriaId) {
      throw new Error("Inscrição inválida para a categoria/torneio");
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
      .where(
        and(
          eq(inscricoes.categoriaId, dados.categoriaId),
          sql`${inscricoes.id} <> ${inscricaoId}`,
          inArray(equipeIntegrantes.usuarioId, [atletaAId, atletaBId])
        )
      )
      .limit(1);

    if (conflito.length > 0) {
      throw new Error("Um dos atletas já está inscrito nesta categoria");
    }

    if (dados.equipeNome !== undefined) {
      const nome = (dados.equipeNome || "").trim();
      await db.update(equipes).set({ nome: nome ? nome : null }).where(eq(equipes.id, ins.equipeId));
    }

    if (dados.status) {
      await db.update(inscricoes).set({ status: dados.status }).where(eq(inscricoes.id, inscricaoId));
    }

    await db.delete(equipeIntegrantes).where(eq(equipeIntegrantes.equipeId, ins.equipeId));
    await db.insert(equipeIntegrantes).values([
      { equipeId: ins.equipeId, usuarioId: atletaAId },
      { equipeId: ins.equipeId, usuarioId: atletaBId },
    ]);

    await db
      .delete(inscricaoPagamentos)
      .where(and(eq(inscricaoPagamentos.inscricaoId, inscricaoId), sql`${inscricaoPagamentos.usuarioId} not in (${atletaAId}, ${atletaBId})`));

    await db
      .insert(inscricaoPagamentos)
      .values([
        { inscricaoId, usuarioId: atletaAId, pago: false },
        { inscricaoId, usuarioId: atletaBId, pago: false },
      ])
      .onConflictDoNothing();

    return { ok: true };
  }

  private async upsertAtleta(dados: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null }) {
    const email = normalizeEmail(dados.email);
    const nome = dados.nome.trim();
    const telefone = dados.telefone?.trim() || null;
    const playId = String(dados.playnaquadraAtletaId || "").trim() || null;

    if (!email) throw new Error("Email do atleta é obrigatório");
    if (!nome) throw new Error("Nome do atleta é obrigatório");

    if (playId) {
      const existingByPlay = await db
        .select({ id: usuarios.id, email: usuarios.email, perfil: usuarios.perfil })
        .from(usuarios)
        .where(eq(usuarios.playnaquadraAtletaId, playId))
        .limit(1);
      if (existingByPlay.length > 0) {
        const athlete = existingByPlay[0];
        if (athlete.perfil !== "ATLETA") throw new Error("Parceiro selecionado está vinculado a um usuário não-atleta");

        const conflictingEmail = await db
          .select({ id: usuarios.id, perfil: usuarios.perfil, playnaquadraAtletaId: usuarios.playnaquadraAtletaId })
          .from(usuarios)
          .where(and(eq(usuarios.email, email), sql`${usuarios.id} <> ${athlete.id}`))
          .limit(1);

        if (conflictingEmail.length > 0) {
          const emailAthlete = conflictingEmail[0];
          if (emailAthlete.perfil !== "ATLETA") throw new Error("Email já está vinculado a um usuário não-atleta");
          if (emailAthlete.playnaquadraAtletaId && emailAthlete.playnaquadraAtletaId !== playId) {
            throw new Error("Email informado já está vinculado a outro perfil do Play na Quadra");
          }

          await db.transaction(async (tx) => {
            await tx
              .update(usuarios)
              .set({
                playnaquadraAtletaId: null,
                atualizadoEm: new Date(),
              })
              .where(eq(usuarios.id, athlete.id));

            await tx
              .update(usuarios)
              .set({
                nome,
                email,
                telefone,
                playnaquadraAtletaId: playId,
                ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
                atualizadoEm: new Date(),
              })
              .where(eq(usuarios.id, emailAthlete.id));
          });

          return emailAthlete.id;
        }

        await db
          .update(usuarios)
          .set({
            nome,
            email,
            telefone,
            ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
            atualizadoEm: new Date(),
          })
          .where(eq(usuarios.id, athlete.id));
        return athlete.id;
      }
    }

    const existing = await db
      .select({ id: usuarios.id, perfil: usuarios.perfil, playnaquadraAtletaId: usuarios.playnaquadraAtletaId })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    if (existing.length > 0) {
      const athlete = existing[0];
      if (athlete.perfil !== "ATLETA") throw new Error("Email já está vinculado a um usuário não-atleta");

      if (playId && athlete.playnaquadraAtletaId !== playId) {
        const conflictingPlay = await db
          .select({ id: usuarios.id, perfil: usuarios.perfil })
          .from(usuarios)
          .where(eq(usuarios.playnaquadraAtletaId, playId))
          .limit(1);

        if (conflictingPlay.length > 0 && conflictingPlay[0].id !== athlete.id) {
          if (conflictingPlay[0].perfil !== "ATLETA") {
            throw new Error("Parceiro selecionado está vinculado a um usuário não-atleta");
          }

          await db.transaction(async (tx) => {
            await tx
              .update(usuarios)
              .set({
                playnaquadraAtletaId: null,
                atualizadoEm: new Date(),
              })
              .where(eq(usuarios.id, conflictingPlay[0].id));

            await tx
              .update(usuarios)
              .set({
                nome,
                telefone,
                playnaquadraAtletaId: playId,
                ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
                atualizadoEm: new Date(),
              })
              .where(eq(usuarios.id, athlete.id));
          });

          return athlete.id;
        }
      }

      await db
        .update(usuarios)
        .set({
          nome,
          telefone,
          playnaquadraAtletaId: playId,
          ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, athlete.id));
      return athlete.id;
    }

    const [novo] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        telefone,
        perfil: "ATLETA",
        playnaquadraAtletaId: playId,
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
