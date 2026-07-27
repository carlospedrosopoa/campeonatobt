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
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playBuscarAtletas, playGetAtletaById } from "@/services/playnaquadra-client";

const STATUS_INSCRICOES_ATIVAS = ["APROVADA", "PENDENTE", "FILA_ESPERA"] as const;

type DestinatarioComunicacao = {
  usuarioId: string;
  usuarioNome: string;
  email: string | null;
  telefone: string | null;
  playnaquadraAtletaId: string | null;
};

type ResultadoEnvioWhatsapp = {
  usuarioId: string;
  status: "ENVIADO" | "FALHA";
  erro: string | null;
};

function normalizarTexto(value?: string | null) {
  return String(value || "").trim();
}

function normalizarEmail(value?: string | null) {
  return normalizarTexto(value).toLowerCase();
}

function normalizarNome(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

type PlayCandidate = {
  playnaquadraAtletaId: string | null;
  nome: string;
  email: string;
  telefone: string | null;
};

function extrairPlayCandidate(item: any): PlayCandidate | null {
  const playnaquadraAtletaId = String(item?.id || item?._id || item?.atletaId || item?.usuarioId || "").trim() || null;
  const nome = String(item?.nome || item?.usuario?.nome || item?.atleta?.nome || "").trim();
  const email = normalizarEmail(item?.email || item?.usuario?.email || item?.atleta?.email || "");
  const telefone = String(item?.telefone || item?.usuario?.telefone || item?.atleta?.telefone || "").trim() || null;

  if (!playnaquadraAtletaId && !nome && !email) return null;

  return {
    playnaquadraAtletaId,
    nome: nome || email || "Atleta",
    email,
    telefone,
  };
}

async function enriquecerDestinatariosComTelefonePlay(destinatarios: DestinatarioComunicacao[]) {
  const pendentes = destinatarios.filter((item) => !normalizarTexto(item.telefone));
  if (pendentes.length === 0) return destinatarios;

  try {
    const token = await getPlayAdminToken();

    const atualizados = await Promise.all(
      destinatarios.map(async (destinatario) => {
        if (normalizarTexto(destinatario.telefone)) return destinatario;

        const queries = Array.from(
          new Set(
            [
              normalizarEmail(destinatario.email),
              normalizarNome(destinatario.usuarioNome),
            ].filter((value) => String(value || "").trim().length >= 2)
          )
        );

        const candidates: PlayCandidate[] = [];

        if (destinatario.playnaquadraAtletaId?.trim()) {
          const byId = await playGetAtletaById({ token, atletaId: destinatario.playnaquadraAtletaId.trim() });
          const parsedById = byId.res.ok ? extrairPlayCandidate(byId.data) : null;
          if (parsedById) candidates.push(parsedById);
        }

        for (const query of queries) {
          const result = await playBuscarAtletas({ token, q: query, limite: 10 });
          if (!result.res.ok || !result.data) continue;

          const rawCandidates: any[] = Array.isArray(result.data?.atletas) ? result.data.atletas : Array.isArray(result.data) ? result.data : [];
          const parsed = rawCandidates
            .map<PlayCandidate | null>((item: any) => extrairPlayCandidate(item))
            .filter((item): item is PlayCandidate => Boolean(item));

          candidates.push(...parsed);
        }

        const unique = new Map<string, PlayCandidate>();
        for (const candidate of candidates) {
          const key = String(candidate.playnaquadraAtletaId || candidate.email || candidate.nome || "").trim();
          if (!key || unique.has(key)) continue;
          unique.set(key, candidate);
        }

        const email = normalizarEmail(destinatario.email);
        const nome = normalizarNome(destinatario.usuarioNome);
        const ranked = Array.from(unique.values())
          .map((candidate) => {
            let score = 0;
            const candidateEmail = normalizarEmail(candidate.email);
            const candidateName = normalizarNome(candidate.nome);

            if (destinatario.playnaquadraAtletaId && candidate.playnaquadraAtletaId === destinatario.playnaquadraAtletaId) score += 200;
            if (email && candidateEmail === email) score += 120;
            if (nome && candidateName === nome) score += 80;
            if (nome && candidateName && (candidateName.includes(nome) || nome.includes(candidateName))) score += 30;
            if (candidate.telefone) score += 20;

            return { candidate, score };
          })
          .sort((a, b) => b.score - a.score);

        const best = ranked[0]?.candidate ?? null;
        const bestScore = ranked[0]?.score ?? 0;
        const telefone = normalizarTexto(best?.telefone) || null;
        if (!best || bestScore <= 0 || !telefone) return destinatario;

        await db
          .update(usuarios)
          .set({
            telefone,
            playnaquadraAtletaId: best.playnaquadraAtletaId || destinatario.playnaquadraAtletaId || null,
            atualizadoEm: new Date(),
          })
          .where(eq(usuarios.id, destinatario.usuarioId));

        return {
          ...destinatario,
          telefone,
          playnaquadraAtletaId: best.playnaquadraAtletaId || destinatario.playnaquadraAtletaId || null,
        };
      })
    );

    return atualizados;
  } catch {
    return destinatarios;
  }
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
      email: usuarios.email,
      telefone: usuarios.telefone,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
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
      email: row.email,
      telefone: row.telefone ?? null,
      playnaquadraAtletaId: row.playnaquadraAtletaId ?? null,
    });
  }

  return enriquecerDestinatariosComTelefonePlay(Array.from(destinatarios.values()));
}

export const torneioComunicacoesService = {
  async contarDestinatarios(params: { torneioId: string; categoriaId?: string | null }) {
    const destinatarios = await listarDestinatariosBase(params);
    return destinatarios.length;
  },

  async listarComunicacoesAdmin(torneioId: string) {
    const comunicacoes = await db
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

    if (comunicacoes.length === 0) {
      return [];
    }

    const comunicacaoIds = comunicacoes.map((item) => item.id);
    const detalhesRows = await db
      .select({
        comunicacaoId: torneioComunicacaoDestinatarios.comunicacaoId,
        usuarioId: torneioComunicacaoDestinatarios.usuarioId,
        usuarioNome: usuarios.nome,
        telefone: torneioComunicacaoDestinatarios.telefone,
        whatsappStatus: torneioComunicacaoDestinatarios.whatsappStatus,
        whatsappErro: torneioComunicacaoDestinatarios.whatsappErro,
      })
      .from(torneioComunicacaoDestinatarios)
      .leftJoin(usuarios, eq(torneioComunicacaoDestinatarios.usuarioId, usuarios.id))
      .where(
        and(
          eq(torneioComunicacaoDestinatarios.torneioId, torneioId),
          inArray(torneioComunicacaoDestinatarios.comunicacaoId, comunicacaoIds),
          inArray(torneioComunicacaoDestinatarios.whatsappStatus, ["FALHA", "SEM_TELEFONE"])
        )
      )
      .orderBy(asc(usuarios.nome), asc(torneioComunicacaoDestinatarios.usuarioId));

    const detalhesPorComunicacao = new Map<
      string,
      {
        falhasDestinatarios: Array<{
          usuarioId: string;
          usuarioNome: string | null;
          telefone: string | null;
          whatsappErro: string | null;
        }>;
        semTelefoneDestinatarios: Array<{
          usuarioId: string;
          usuarioNome: string | null;
        }>;
      }
    >();

    for (const row of detalhesRows) {
      const atual =
        detalhesPorComunicacao.get(row.comunicacaoId) ??
        {
          falhasDestinatarios: [],
          semTelefoneDestinatarios: [],
        };

      if (row.whatsappStatus === "FALHA") {
        atual.falhasDestinatarios.push({
          usuarioId: row.usuarioId,
          usuarioNome: row.usuarioNome ?? null,
          telefone: row.telefone ?? null,
          whatsappErro: row.whatsappErro ?? null,
        });
      }

      if (row.whatsappStatus === "SEM_TELEFONE") {
        atual.semTelefoneDestinatarios.push({
          usuarioId: row.usuarioId,
          usuarioNome: row.usuarioNome ?? null,
        });
      }

      detalhesPorComunicacao.set(row.comunicacaoId, atual);
    }

    return comunicacoes.map((item) => {
      const detalhes = detalhesPorComunicacao.get(item.id);
      return {
        ...item,
        falhasDestinatarios: detalhes?.falhasDestinatarios ?? [],
        semTelefoneDestinatarios: detalhes?.semTelefoneDestinatarios ?? [],
      };
    });
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
        usuarioNome: usuarios.nome,
        email: usuarios.email,
        telefoneRegistro: torneioComunicacaoDestinatarios.telefone,
        telefoneAtual: usuarios.telefone,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(torneioComunicacaoDestinatarios)
      .leftJoin(usuarios, eq(torneioComunicacaoDestinatarios.usuarioId, usuarios.id))
      .where(
        and(
          eq(torneioComunicacaoDestinatarios.comunicacaoId, params.comunicacaoId),
          eq(torneioComunicacaoDestinatarios.torneioId, params.torneioId),
          inArray(torneioComunicacaoDestinatarios.whatsappStatus, ["FALHA", "SEM_TELEFONE"])
        )
      );

    if (falhas.length === 0) {
      throw new Error("Não há falhas pendentes para reenviar nesta comunicação.");
    }

    const destinatarios = await enriquecerDestinatariosComTelefonePlay(
      falhas.map((item) => ({
        usuarioId: item.usuarioId,
        usuarioNome: item.usuarioNome ?? "Atleta",
        email: item.email,
        telefone: normalizarTexto(item.telefoneAtual) || normalizarTexto(item.telefoneRegistro) || null,
        playnaquadraAtletaId: item.playnaquadraAtletaId ?? null,
      }))
    );

    for (const destinatario of destinatarios) {
      await db
        .update(torneioComunicacaoDestinatarios)
        .set({
          telefone: destinatario.telefone,
          whatsappStatus: normalizarTexto(destinatario.telefone) ? "PENDENTE" : "SEM_TELEFONE",
          whatsappErro: null,
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(torneioComunicacaoDestinatarios.comunicacaoId, params.comunicacaoId),
            eq(torneioComunicacaoDestinatarios.torneioId, params.torneioId),
            eq(torneioComunicacaoDestinatarios.usuarioId, destinatario.usuarioId)
          )
        );
    }

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

  async excluirNotificacoesAtleta(params: { usuarioId: string; ids?: string[]; all?: boolean }) {
    const ids = Array.from(new Set((params.ids || []).map((item) => String(item || "").trim()).filter(Boolean)));

    const filtros = [eq(torneioComunicacaoDestinatarios.usuarioId, params.usuarioId)];
    if (params.all !== true && ids.length > 0) {
      filtros.push(inArray(torneioComunicacaoDestinatarios.id, ids));
    }
    if (params.all !== true && ids.length === 0) {
      return { totalExcluidas: 0 };
    }

    const deleted = await db
      .delete(torneioComunicacaoDestinatarios)
      .where(and(...filtros))
      .returning({ id: torneioComunicacaoDestinatarios.id });

    return { totalExcluidas: deleted.length };
  },
};
