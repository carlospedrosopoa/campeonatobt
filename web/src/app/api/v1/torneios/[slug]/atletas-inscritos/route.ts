﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, torneioAtletaPrefs, usuarios } from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { buscarCamisetaAtletaNoPlay } from "@/services/playnaquadra-camiseta";
import { categoriaConfigService } from "@/services/categoria-config.service";
import type { CategoriaTipoParticipacao } from "@/services/categoria-config.service";

function primeiroNome(nome: string) {
  const trimmed = (nome || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] || "";
}

function removerAcentos(str: string) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function montarNomeDupla(
  equipeNome: string | null,
  atletasDaCategoriaNaEquipe: string[],
  todosIntegrantesReaisDaEquipe: string[]
) {
  const integrantesReais =
    Array.isArray(todosIntegrantesReaisDaEquipe) && todosIntegrantesReaisDaEquipe.length > 0
      ? todosIntegrantesReaisDaEquipe
      : atletasDaCategoriaNaEquipe ?? [];

  const primeirosNomes = integrantesReais
    .map(primeiroNome)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  const nomeEquipe = (equipeNome || "").trim();

  if (primeirosNomes.length === 0) {
    return nomeEquipe || "Dupla";
  }

  const usarIntegrantesOrdenados = () => {
    return primeirosNomes.slice().sort((a, b) => a.localeCompare(b)).join("/") || "Dupla";
  };

  if (!nomeEquipe) return usarIntegrantesOrdenados();

  const primeiroNomeSet = new Set(primeirosNomes.map((n) => n.toLowerCase()));
  const integranteNomeCompletoSet = new Set(
    integrantesReais.map((n) => removerAcentos(String(n || "").toLowerCase()))
  );
  const equipeNomeLower = nomeEquipe.toLowerCase();
  const equipeNomeSemAcento = removerAcentos(equipeNomeLower);
  const equipeNomeTemSeparador = nomeEquipe.includes("/") || nomeEquipe.includes(" e ") || nomeEquipe.includes("&");

  let pareceNomeIndividual = false;
  if (primeiroNomeSet.has(equipeNomeLower)) pareceNomeIndividual = true;
  if (!pareceNomeIndividual) {
    for (const nomeCompleto of integranteNomeCompletoSet) {
      if (!nomeCompleto) continue;
      if (nomeCompleto === equipeNomeSemAcento) { pareceNomeIndividual = true; break; }
      if (nomeCompleto.startsWith(`${equipeNomeSemAcento} `)) { pareceNomeIndividual = true; break; }
      if (equipeNomeSemAcento && nomeCompleto && equipeNomeSemAcento.length >= 3 && nomeCompleto.startsWith(equipeNomeSemAcento.split(/\s/)[0] as string) && equipeNomeSemAcento.split(/\s+/).length <= 2 && equipeNomeTemSeparador === false) {
        const partes = equipeNomeLower.split(/\s+/).filter(Boolean);
        if (partes.length <= 2 && primeiroNomeSet.has(partes[0] as string)) {
          pareceNomeIndividual = true;
          break;
        }
      }
    }
  }

  if (!pareceNomeIndividual && equipeNomeTemSeparador) {
    return nomeEquipe;
  }

  if (!pareceNomeIndividual && primeirosNomes.length >= 2) {
    const partesEquipe = nomeEquipe
      .split(/[\s/&]+| e /i)
      .map((s) => s.trim())
      .filter(Boolean);
    const matches = partesEquipe.filter((p) => primeiroNomeSet.has(p.toLowerCase())).length;
    if (matches >= 2) return nomeEquipe;
    if (matches === 0 && nomeEquipe.length >= 5) return nomeEquipe;
  }

  return usarIntegrantesOrdenados();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

  const { searchParams } = new URL(request.url);
  const statusParam = (searchParams.get("status") || "").trim();
  const statuses =
    statusParam.length > 0
      ? statusParam
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : ["APROVADA", "PENDENTE", "FILA_ESPERA"];

  const valid = new Set(["APROVADA", "PENDENTE", "RECUSADA", "FILA_ESPERA"]);
  const statusesValidos = statuses.filter((s) => valid.has(s));
  const statusesFiltro = statusesValidos.length > 0 ? statusesValidos : ["APROVADA", "PENDENTE", "FILA_ESPERA"];

  const rows = await db
    .select({
      categoriaId: categorias.id,
      categoriaNome: categorias.nome,
      categoriaGenero: categorias.genero,
      categoriaDataHorario: categorias.dataHorario,
      inscricaoData: inscricoes.dataInscricao,
      inscricaoId: inscricoes.id,
      inscricaoStatus: inscricoes.status,
      equipeId: equipes.id,
      equipeNome: equipes.nome,
      equipeCapitaoUsuarioId: equipes.capitaoUsuarioId,
      atletaId: usuarios.id,
      atletaNome: usuarios.nome,
      atletaEmail: usuarios.email,
      atletaTelefone: usuarios.telefone,
      atletaPlaynaquadraId: usuarios.playnaquadraAtletaId,
      atletaPago: inscricaoPagamentos.pago,
      atletaPagamentoStatus: inscricaoPagamentos.status,
      atletaValorDevido: inscricaoPagamentos.valorDevido,
      atletaCamiseta: torneioAtletaPrefs.camisetaOpcao,
    })
    .from(inscricoes)
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
    .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
    .leftJoin(inscricaoPagamentos, and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, usuarios.id)))
    .leftJoin(torneioAtletaPrefs, and(eq(torneioAtletaPrefs.torneioId, torneio.id), eq(torneioAtletaPrefs.usuarioId, usuarios.id)))
    .where(and(eq(inscricoes.torneioId, torneio.id), inArray(inscricoes.status, statusesFiltro as any)))
    .orderBy(asc(inscricoes.dataInscricao), asc(categorias.dataHorario), asc(categorias.nome), asc(equipes.nome), asc(usuarios.nome));

  const categoriaIdsUnicos = Array.from(new Set(rows.map((r) => r.categoriaId).filter(Boolean)));
  const tiposPorCategoria = new Map<string, CategoriaTipoParticipacao>();
  await Promise.all(
    categoriaIdsUnicos.map(async (catId) => {
      const cfg = await categoriaConfigService.obterOuDefault(catId);
      tiposPorCategoria.set(catId, cfg.tipoParticipacao === "SIMPLES" ? "SIMPLES" : "DUPLAS");
    })
  );

  const inscricaoIdsUnicos = Array.from(new Set(rows.map((r) => r.inscricaoId).filter(Boolean)));
  const pagamentosPorInscricao = new Map<string, { usuarioId: string; pago: boolean; status?: string | null; valorDevido?: string | null }[]>();
  if (inscricaoIdsUnicos.length > 0) {
    const pags = await db
      .select({
        inscricaoId: inscricaoPagamentos.inscricaoId,
        usuarioId: inscricaoPagamentos.usuarioId,
        pago: inscricaoPagamentos.pago,
        status: inscricaoPagamentos.status,
        valorDevido: inscricaoPagamentos.valorDevido,
      })
      .from(inscricaoPagamentos)
      .where(inArray(inscricaoPagamentos.inscricaoId, inscricaoIdsUnicos));
    for (const p of pags) {
      if (!pagamentosPorInscricao.has(p.inscricaoId)) pagamentosPorInscricao.set(p.inscricaoId, []);
      pagamentosPorInscricao.get(p.inscricaoId)!.push({ usuarioId: p.usuarioId, pago: Boolean(p.pago), status: p.status, valorDevido: p.valorDevido });
    }
  }

  const equipeIdsUnicos = Array.from(new Set(rows.map((r) => r.equipeId).filter(Boolean)));
  const integrantesReaisPorEquipe = new Map<string, { usuarioId: string; nome: string }[]>();
  if (equipeIdsUnicos.length > 0) {
    const rowsIntegrantes = await db
      .select({
        equipeId: equipeIntegrantes.equipeId,
        usuarioId: equipeIntegrantes.usuarioId,
        atletaNome: usuarios.nome,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
      .where(inArray(equipeIntegrantes.equipeId, equipeIdsUnicos));
    for (const r of rowsIntegrantes) {
      if (!r.equipeId || !r.atletaNome || !r.usuarioId) continue;
      const arr = integrantesReaisPorEquipe.get(r.equipeId) ?? [];
      arr.push({ usuarioId: r.usuarioId, nome: r.atletaNome });
      integrantesReaisPorEquipe.set(r.equipeId, arr);
    }
  }

  type RowAtleta = {
    atletaId: string;
    atletaNome: string;
    atletaEmail: string;
    atletaTelefone: string | null;
    atletaPlaynaquadraId: string | null;
    atletaCamiseta: string | null;
    equipeId: string;
    equipeNome: string | null;
    inscricaoId: string;
    inscricaoStatus: string;
    pago: boolean;
    categoriaId: string;
    categoriaNome: string;
  };

  const byCategoria = new Map<
    string,
    {
      categoriaId: string;
      categoriaNome: string;
      categoriaGenero: string;
      categoriaDataHorario: Date | null;
      tipoParticipacao: CategoriaTipoParticipacao;
      atletas: RowAtleta[];
    }
  >();

  const byInscricao = new Map<string, RowAtleta[]>();
  for (const r of rows) {
    const row: RowAtleta = {
      atletaId: r.atletaId,
      atletaNome: r.atletaNome,
      atletaEmail: r.atletaEmail,
      atletaTelefone: r.atletaTelefone ?? null,
      atletaPlaynaquadraId: r.atletaPlaynaquadraId ?? null,
      atletaCamiseta: r.atletaCamiseta ?? null,
      equipeId: r.equipeId,
      equipeNome: r.equipeNome ?? null,
      inscricaoId: r.inscricaoId,
      inscricaoStatus: r.inscricaoStatus,
      pago: Boolean(r.atletaPago) || r.atletaPagamentoStatus === "PAGO",
      categoriaId: r.categoriaId,
      categoriaNome: r.categoriaNome,
    };
    if (!byInscricao.has(r.inscricaoId)) byInscricao.set(r.inscricaoId, []);
    byInscricao.get(r.inscricaoId)!.push(row);

    const catId = r.categoriaId;
    if (!byCategoria.has(catId)) {
      byCategoria.set(catId, {
        categoriaId: r.categoriaId,
        categoriaNome: r.categoriaNome,
        categoriaGenero: r.categoriaGenero,
        categoriaDataHorario: r.categoriaDataHorario ?? null,
        tipoParticipacao: tiposPorCategoria.get(catId) ?? "DUPLAS",
        atletas: [],
      });
    }
  }

  const equipesJáComCapitãoCorrigido = new Set<string>();
  const updatesCapitao: { equipeId: string; capitaoUsuarioId: string | null }[] = [];
  const atletasJaIncluidosNaCategoria = new Set<string>();

  for (const [inscricaoId, atletasDaInscricao] of byInscricao.entries()) {
    if (atletasDaInscricao.length === 0) continue;
    const primeiro = atletasDaInscricao[0];
    const cat = byCategoria.get(primeiro.categoriaId);
    if (!cat) continue;

    const ehSimples = cat.tipoParticipacao === "SIMPLES";

    if (ehSimples) {
      let selecionado: RowAtleta | null = null;
      const integrantesReaisEquipe = integrantesReaisPorEquipe.get(primeiro.equipeId) ?? [];
      const capitaoId = rows.find((r) => r.inscricaoId === inscricaoId)?.equipeCapitaoUsuarioId ?? null;

      if (capitaoId) {
        const m = atletasDaInscricao.find((a) => a.atletaId === capitaoId);
        if (m) selecionado = m;
      }
      if (!selecionado && atletasDaInscricao.length === 1) {
        selecionado = atletasDaInscricao[0];
      }
      if (!selecionado && integrantesReaisEquipe.length === 1) {
        const uId = integrantesReaisEquipe[0].usuarioId;
        selecionado = atletasDaInscricao.find((a) => a.atletaId === uId) ?? atletasDaInscricao[0];
      }
      if (!selecionado && atletasDaInscricao.length > 1) {
        const pags = pagamentosPorInscricao.get(inscricaoId) ?? [];
        const comValor = pags.filter((p) => p.valorDevido);
        if (comValor.length === 1) {
          const uId = comValor[0].usuarioId;
          selecionado = atletasDaInscricao.find((a) => a.atletaId === uId) ?? atletasDaInscricao[0];
          const pg = comValor[0];
          if (selecionado && selecionado.atletaId === uId) {
            const status = pg.status ?? (pg.pago ? "PAGO" : "PENDENTE");
            selecionado.pago = pg.pago || status === "PAGO";
          }
        }
      }
      if (!selecionado) {
        selecionado = atletasDaInscricao[0];
      }

      const primeiroNomeAtleta = (selecionado.atletaNome || "").trim().split(/\s+/)[0];
      selecionado.equipeNome = primeiroNomeAtleta || (selecionado.equipeNome || "Atleta");

      if (!equipesJáComCapitãoCorrigido.has(primeiro.equipeId)) {
        equipesJáComCapitãoCorrigido.add(primeiro.equipeId);
        if (selecionado.atletaId && selecionado.atletaId !== capitaoId) {
          updatesCapitao.push({ equipeId: primeiro.equipeId, capitaoUsuarioId: selecionado.atletaId });
        }
      }

      const dedupKey = `${cat.categoriaId}::${selecionado.atletaId}`;
      if (atletasJaIncluidosNaCategoria.has(dedupKey)) continue;
      atletasJaIncluidosNaCategoria.add(dedupKey);
      cat.atletas.push(selecionado);
    } else {
      for (const atleta of atletasDaInscricao) {
        const dedupKey = `${cat.categoriaId}::${atleta.atletaId}`;
        if (atletasJaIncluidosNaCategoria.has(dedupKey)) continue;
        atletasJaIncluidosNaCategoria.add(dedupKey);
        cat.atletas.push(atleta);
      }
    }
  }

  if (updatesCapitao.length > 0) {
    const chunks: typeof updatesCapitao[] = [];
    for (let i = 0; i < updatesCapitao.length; i += 100) chunks.push(updatesCapitao.slice(i, i + 100));
    for (const chunk of chunks) {
      await db.transaction(async (tx) => {
        for (const u of chunk) {
          await tx.update(equipes).set({ capitaoUsuarioId: u.capitaoUsuarioId }).where(eq(equipes.id, u.equipeId));
        }
      });
    }
  }

  const playIdsSemCamiseta = Array.from(
    new Set(
      Array.from(byCategoria.values())
        .flatMap((categoria) => categoria.atletas)
        .filter((atleta) => !String(atleta.atletaCamiseta || "").trim() && String(atleta.atletaPlaynaquadraId || "").trim())
        .map((atleta) => String(atleta.atletaPlaynaquadraId || "").trim())
        .filter(Boolean)
    )
  );

  const camisetasDoPlay = new Map<string, string | null>();
  await Promise.all(
    playIdsSemCamiseta.map(async (playId) => {
      const camiseta = await buscarCamisetaAtletaNoPlay(playId);
      camisetasDoPlay.set(playId, camiseta);
    })
  );

  const categoriasResult = Array.from(byCategoria.values())
    .map((categoria) => {
      const atletasPorEquipe = new Map<string, string[]>();
      for (const atleta of categoria.atletas) {
        const lista = atletasPorEquipe.get(atleta.equipeId) ?? [];
        lista.push(atleta.atletaNome);
        atletasPorEquipe.set(atleta.equipeId, lista);
      }

      return {
        ...categoria,
        atletas: categoria.atletas
          .map((atleta) => ({
            ...atleta,
            atletaCamiseta:
              atleta.atletaCamiseta ??
              (atleta.atletaPlaynaquadraId ? camisetasDoPlay.get(atleta.atletaPlaynaquadraId) ?? null : null),
            equipeNome: montarNomeDupla(
              atleta.equipeNome,
              atletasPorEquipe.get(atleta.equipeId) ?? [],
              integrantesReaisPorEquipe.get(atleta.equipeId) ?? []
            ),
          }))
          .sort((a, b) => {
            const equipe = (a.equipeNome || "").localeCompare(b.equipeNome || "");
            if (equipe !== 0) return equipe;
            return a.atletaNome.localeCompare(b.atletaNome);
          }),
      };
    })
    .filter((categoria) => categoria.atletas.length > 0)
    .sort((a, b) => {
      const ta = a.categoriaDataHorario ? new Date(a.categoriaDataHorario).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.categoriaDataHorario ? new Date(b.categoriaDataHorario).getTime() : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return a.categoriaNome.localeCompare(b.categoriaNome);
    })
    .map((c) => ({
      ...c,
      categoriaDataHorario: c.categoriaDataHorario ? c.categoriaDataHorario.toISOString() : null,
    }));

  return NextResponse.json(
    {
      torneio: {
        id: torneio.id,
        nome: torneio.nome,
        slug: torneio.slug,
        camisetaOpcoes: Array.isArray(torneio.camisetaOpcoes) ? torneio.camisetaOpcoes.map((item) => String(item)) : [],
      },
      categorias: categoriasResult,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
