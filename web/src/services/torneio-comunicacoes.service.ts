import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categorias,
  equipeIntegrantes,
  equipes,
  inscricoes,
  torneioComunicacaoDestinatarios,
  torneioComunicacoes,
  torneios,
  usuarios,
} from "@/db/schema";
import { enviarMensagemGzappy } from "@/services/gzappy.service";

const STATUS_INSCRICOES_ATIVAS = ["APROVADA", "PENDENTE", "FILA_ESPERA"] as const;

type DestinatarioComunicacao = {
  usuarioId: string;
  usuarioNome: string;
  telefone: string | null;
};

type ResultadoEnvioWhatsapp = {
  usuarioId: string;
  status: "ENVIADO" | "FALHA";
  erro: string | null;
};

function normalizarTexto(value?: string | null) {
  return String(value || "").trim();
}

function montarMensagemWhatsapp(params: { torneioNome: string; titulo?: string | null; mensagem: string }) {
  const titulo = normalizarTexto(params.titulo);
  const mensagem = normalizarTexto(params.mensagem);
  const torneioNome = normalizarTexto(params.torneioNome);

  if (titulo) {
    return `*${titulo}*\n_${torneioNome}_\n\n${mensagem}`;
  }

  return `*${torneioNome}*\n\n${mensagem}`;
}

async function enviarWhatsappParaDestinatarios(params: {
  mensagemWhatsapp: string;
  destinatarios: Array<{ usuarioId: string; telefone: string | null }>;
}) {
  const destinatariosComTelefone = params.destinatarios.filter((item) => normalizarTexto(item.telefone));

  return Promise.all(
    destinatariosComTelefone.map(async (destinatario): Promise<ResultadoEnvioWhatsapp> => {
      try {
        const result = await enviarMensagemGzappy({
          destinatario: String(destinatario.telefone),
          mensagem: params.mensagemWhatsapp,
        });

        if (result.ok) {
          return { usuarioId: destinatario.usuarioId, status: "ENVIADO", erro: null };
        }

        return {
          usuarioId: destinatario.usuarioId,
          status: "FALHA",
          erro: result.skipped ? "Envio não realizado pelo Gzappy." : `Falha no envio (${result.status ?? "erro"})`,
        };
      } catch (error: any) {
        return {
          usuarioId: destinatario.usuarioId,
          status: "FALHA",
          erro: error?.message || "Erro inesperado ao enviar WhatsApp.",
        };
      }
    })
  );
}

async function atualizarResumoWhatsappComunicacao(params: {
  comunicacaoId: string;
  resultados: ResultadoEnvioWhatsapp[];
}) {
  return db.transaction(async (tx) => {
    for (const resultado of params.resultados) {
      await tx
        .update(torneioComunicacaoDestinatarios)
        .set({
          whatsappStatus: resultado.status,
          whatsappErro: resultado.erro,
          whatsappEnviadoEm: resultado.status === "ENVIADO" ? new Date() : null,
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(torneioComunicacaoDestinatarios.comunicacaoId, params.comunicacaoId),
            eq(torneioComunicacaoDestinatarios.usuarioId, resultado.usuarioId)
          )
        );
    }

    const statusRows = await tx
      .select({
        whatsappStatus: torneioComunicacaoDestinatarios.whatsappStatus,
      })
      .from(torneioComunicacaoDestinatarios)
      .where(eq(torneioComunicacaoDestinatarios.comunicacaoId, params.comunicacaoId));

    const totais = statusRows.reduce(
      (acc, row) => {
        if (row.whatsappStatus === "ENVIADO") acc.totalWhatsappEnviados += 1;
        if (row.whatsappStatus === "FALHA") acc.totalWhatsappFalhas += 1;
        if (row.whatsappStatus === "SEM_TELEFONE") acc.totalWhatsappSemTelefone += 1;
        return acc;
      },
      {
        totalWhatsappEnviados: 0,
        totalWhatsappFalhas: 0,
        totalWhatsappSemTelefone: 0,
      }
    );

    await tx
      .update(torneioComunicacoes)
      .set({
        ...totais,
        atualizadoEm: new Date(),
      })
      .where(eq(torneioComunicacoes.id, params.comunicacaoId));

    return totais;
  });
}

async function listarDestinatariosBase(params: { torneioId: string; categoriaId?: string | null }) {
  const filtros = [
    eq(inscricoes.torneioId, params.torneioId),
    inArray(inscricoes.status, [...STATUS_INSCRICOES_ATIVAS]),
  ];

  if (params.categoriaId) {
    filtros.push(eq(inscricoes.categoriaId, params.categoriaId));
  }

  const rows = await db
    .select({
      usuarioId: usuarios.id,
      usuarioNome: usuarios.nome,
      telefone: usuarios.telefone,
    })
    .from(inscricoes)
    .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
    .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
    .where(and(...filtros))
    .orderBy(asc(inscricoes.dataInscricao), asc(usuarios.nome));

  const destinatarios = new Map<string, DestinatarioComunicacao>();
  for (const row of rows) {
    if (destinatarios.has(row.usuarioId)) continue;
    destinatarios.set(row.usuarioId, {
      usuarioId: row.usuarioId,
      usuarioNome: row.usuarioNome,
      telefone: row.telefone ?? null,
    });
  }

  return Array.from(destinatarios.values());
}

export const torneioComunicacoesService = {
  async contarDestinatarios(params: { torneioId: string; categoriaId?: string | null }) {
    const destinatarios = await listarDestinatariosBase(params);
    return destinatarios.length;
  },

  async listarComunicacoesAdmin(torneioId: string) {
    return db
      .select({
        id: torneioComunicacoes.id,
        categoriaId: torneioComunicacoes.categoriaId,
        categoriaNome: categorias.nome,
        titulo: torneioComunicacoes.titulo,
        mensagem: torneioComunicacoes.mensagem,
        enviarWhatsapp: torneioComunicacoes.enviarWhatsapp,
        publicarNoApp: torneioComunicacoes.publicarNoApp,
        totalDestinatarios: torneioComunicacoes.totalDestinatarios,
        totalWhatsappEnviados: torneioComunicacoes.totalWhatsappEnviados,
        totalWhatsappFalhas: torneioComunicacoes.totalWhatsappFalhas,
        totalWhatsappSemTelefone: torneioComunicacoes.totalWhatsappSemTelefone,
        criadoEm: torneioComunicacoes.criadoEm,
        criadoPorNome: usuarios.nome,
      })
      .from(torneioComunicacoes)
      .leftJoin(categorias, eq(torneioComunicacoes.categoriaId, categorias.id))
      .leftJoin(usuarios, eq(torneioComunicacoes.criadoPorId, usuarios.id))
      .where(eq(torneioComunicacoes.torneioId, torneioId))
      .orderBy(desc(torneioComunicacoes.criadoEm));
  },

  async criarComunicacao(params: {
    torneioId: string;
    torneioNome: string;
    criadoPorId: string;
    categoriaId?: string | null;
    titulo?: string | null;
    mensagem: string;
    enviarWhatsapp: boolean;
    publicarNoApp: boolean;
  }) {
    const destinatarios = await listarDestinatariosBase({
      torneioId: params.torneioId,
      categoriaId: params.categoriaId ?? null,
    });

    if (destinatarios.length === 0) {
      throw new Error("Nenhum atleta inscrito encontrado para esta comunicação.");
    }

    const mensagemWhatsapp = montarMensagemWhatsapp({
      torneioNome: params.torneioNome,
      titulo: params.titulo,
      mensagem: params.mensagem,
    });

    const totalSemTelefone = params.enviarWhatsapp
      ? destinatarios.filter((item) => !normalizarTexto(item.telefone)).length
      : 0;

    const [comunicacao] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(torneioComunicacoes)
        .values({
          torneioId: params.torneioId,
          categoriaId: params.categoriaId ?? null,
          criadoPorId: params.criadoPorId,
          titulo: normalizarTexto(params.titulo) || null,
          mensagem: normalizarTexto(params.mensagem),
          enviarWhatsapp: params.enviarWhatsapp,
          publicarNoApp: params.publicarNoApp,
          totalDestinatarios: destinatarios.length,
          totalWhatsappEnviados: 0,
          totalWhatsappFalhas: 0,
          totalWhatsappSemTelefone: totalSemTelefone,
        })
        .returning({
          id: torneioComunicacoes.id,
          totalDestinatarios: torneioComunicacoes.totalDestinatarios,
          totalWhatsappSemTelefone: torneioComunicacoes.totalWhatsappSemTelefone,
        });

      const destinatarioRows: (typeof torneioComunicacaoDestinatarios.$inferInsert)[] = destinatarios.map(
        (destinatario) => ({
          comunicacaoId: created.id,
          torneioId: params.torneioId,
          usuarioId: destinatario.usuarioId,
          telefone: destinatario.telefone,
          whatsappStatus: params.enviarWhatsapp
            ? normalizarTexto(destinatario.telefone)
              ? "PENDENTE"
              : "SEM_TELEFONE"
            : "NAO_ENVIADO",
        })
      );

      await tx.insert(torneioComunicacaoDestinatarios).values(destinatarioRows);

      return [created] as const;
    });

    let totalEnviados = 0;
    let totalFalhas = 0;

    if (params.enviarWhatsapp) {
      const resultados = await enviarWhatsappParaDestinatarios({
        mensagemWhatsapp,
        destinatarios,
      });

      const totaisAtualizados = await atualizarResumoWhatsappComunicacao({
        comunicacaoId: comunicacao.id,
        resultados,
      });

      totalEnviados = totaisAtualizados.totalWhatsappEnviados;
      totalFalhas = totaisAtualizados.totalWhatsappFalhas;
    }

    return {
      id: comunicacao.id,
      totalDestinatarios: comunicacao.totalDestinatarios,
      totalWhatsappEnviados: totalEnviados,
      totalWhatsappFalhas: totalFalhas,
      totalWhatsappSemTelefone: comunicacao.totalWhatsappSemTelefone,
    };
  },

  async reenviarFalhasComunicacao(params: { torneioId: string; comunicacaoId: string }) {
    const [comunicacao] = await db
      .select({
        id: torneioComunicacoes.id,
        torneioId: torneioComunicacoes.torneioId,
        torneioNome: torneios.nome,
        titulo: torneioComunicacoes.titulo,
        mensagem: torneioComunicacoes.mensagem,
        enviarWhatsapp: torneioComunicacoes.enviarWhatsapp,
      })
      .from(torneioComunicacoes)
      .innerJoin(torneios, eq(torneioComunicacoes.torneioId, torneios.id))
      .where(and(eq(torneioComunicacoes.id, params.comunicacaoId), eq(torneioComunicacoes.torneioId, params.torneioId)))
      .limit(1);

    if (!comunicacao) {
      throw new Error("Comunicação não encontrada para este torneio.");
    }

    if (!comunicacao.enviarWhatsapp) {
      throw new Error("Esta comunicação não foi configurada para envio por WhatsApp.");
    }

    const falhas = await db
      .select({
        usuarioId: torneioComunicacaoDestinatarios.usuarioId,
        telefoneRegistro: torneioComunicacaoDestinatarios.telefone,
        telefoneAtual: usuarios.telefone,
      })
      .from(torneioComunicacaoDestinatarios)
      .leftJoin(usuarios, eq(torneioComunicacaoDestinatarios.usuarioId, usuarios.id))
      .where(
        and(
          eq(torneioComunicacaoDestinatarios.comunicacaoId, params.comunicacaoId),
          eq(torneioComunicacaoDestinatarios.torneioId, params.torneioId),
          eq(torneioComunicacaoDestinatarios.whatsappStatus, "FALHA")
        )
      );

    if (falhas.length === 0) {
      throw new Error("Não há falhas pendentes para reenviar nesta comunicação.");
    }

    const destinatarios = falhas.map((item) => ({
      usuarioId: item.usuarioId,
      telefone: normalizarTexto(item.telefoneAtual) || normalizarTexto(item.telefoneRegistro) || null,
    }));

    const mensagemWhatsapp = montarMensagemWhatsapp({
      torneioNome: comunicacao.torneioNome,
      titulo: comunicacao.titulo,
      mensagem: comunicacao.mensagem,
    });

    const resultados = await enviarWhatsappParaDestinatarios({
      mensagemWhatsapp,
      destinatarios,
    });

    if (resultados.length === 0) {
      throw new Error("Nenhum destinatário com telefone válido foi encontrado para o reenvio.");
    }

    const totaisAtualizados = await atualizarResumoWhatsappComunicacao({
      comunicacaoId: comunicacao.id,
      resultados,
    });

    return {
      id: comunicacao.id,
      totalReenviados: resultados.length,
      totalWhatsappEnviados: totaisAtualizados.totalWhatsappEnviados,
      totalWhatsappFalhas: totaisAtualizados.totalWhatsappFalhas,
      totalWhatsappSemTelefone: totaisAtualizados.totalWhatsappSemTelefone,
    };
  },

  async listarNotificacoesAtleta(params: { usuarioId: string; limit?: number }) {
    const limit = Math.max(1, Math.min(100, params.limit ?? 50));

    const [rows, unreadRows] = await Promise.all([
      db
        .select({
          id: torneioComunicacaoDestinatarios.id,
          comunicacaoId: torneioComunicacaoDestinatarios.comunicacaoId,
          lidaEm: torneioComunicacaoDestinatarios.lidaEm,
          criadoEm: torneioComunicacaoDestinatarios.criadoEm,
          whatsappStatus: torneioComunicacaoDestinatarios.whatsappStatus,
          titulo: torneioComunicacoes.titulo,
          mensagem: torneioComunicacoes.mensagem,
          publicarNoApp: torneioComunicacoes.publicarNoApp,
          torneioId: torneios.id,
          torneioNome: torneios.nome,
          torneioSlug: torneios.slug,
          categoriaId: categorias.id,
          categoriaNome: categorias.nome,
        })
        .from(torneioComunicacaoDestinatarios)
        .innerJoin(torneioComunicacoes, eq(torneioComunicacaoDestinatarios.comunicacaoId, torneioComunicacoes.id))
        .innerJoin(torneios, eq(torneioComunicacoes.torneioId, torneios.id))
        .leftJoin(categorias, eq(torneioComunicacoes.categoriaId, categorias.id))
        .where(
          and(
            eq(torneioComunicacaoDestinatarios.usuarioId, params.usuarioId),
            eq(torneioComunicacoes.publicarNoApp, true)
          )
        )
        .orderBy(desc(torneioComunicacaoDestinatarios.criadoEm))
        .limit(limit),
      db
        .select({
          total: sql<number>`count(*)`,
        })
        .from(torneioComunicacaoDestinatarios)
        .innerJoin(torneioComunicacoes, eq(torneioComunicacaoDestinatarios.comunicacaoId, torneioComunicacoes.id))
        .where(
          and(
            eq(torneioComunicacaoDestinatarios.usuarioId, params.usuarioId),
            eq(torneioComunicacoes.publicarNoApp, true),
            isNull(torneioComunicacaoDestinatarios.lidaEm)
          )
        ),
    ]);

    return {
      unreadCount: Number(unreadRows[0]?.total || 0),
      notifications: rows.map((row) => ({
        id: row.id,
        comunicacaoId: row.comunicacaoId,
        titulo: row.titulo,
        mensagem: row.mensagem,
        lidaEm: row.lidaEm ? row.lidaEm.toISOString() : null,
        criadoEm: row.criadoEm.toISOString(),
        whatsappStatus: row.whatsappStatus,
        torneio: {
          id: row.torneioId,
          nome: row.torneioNome,
          slug: row.torneioSlug,
        },
        categoria: row.categoriaId
          ? {
              id: row.categoriaId,
              nome: row.categoriaNome,
            }
          : null,
      })),
    };
  },

  async marcarNotificacoesLidas(params: { usuarioId: string; ids?: string[] }) {
    const ids = Array.from(new Set((params.ids || []).map((item) => String(item || "").trim()).filter(Boolean)));

    const filtros = [
      eq(torneioComunicacaoDestinatarios.usuarioId, params.usuarioId),
      isNull(torneioComunicacaoDestinatarios.lidaEm),
    ];

    if (ids.length > 0) {
      filtros.push(inArray(torneioComunicacaoDestinatarios.id, ids));
    }

    const updated = await db
      .update(torneioComunicacaoDestinatarios)
      .set({
        lidaEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(and(...filtros))
      .returning({ id: torneioComunicacaoDestinatarios.id });

    return { totalAtualizadas: updated.length };
  },
};
