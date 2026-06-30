﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, torneioAtletaPrefs, usuarios } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { buscarCamisetaAtletaNoPlay } from "@/services/playnaquadra-camiseta";

function primeiroNome(nome: string) {
  const trimmed = (nome || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] || "";
}

function montarNomeDupla(equipeNome: string | null, atletas: string[]) {
  const nomeEquipe = (equipeNome || "").trim();
  if (nomeEquipe) return nomeEquipe;
  const nomes = atletas.map(primeiroNome).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return nomes.length > 0 ? nomes.join("/") : "Dupla";
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
      atletaId: usuarios.id,
      atletaNome: usuarios.nome,
      atletaEmail: usuarios.email,
      atletaTelefone: usuarios.telefone,
      atletaPlaynaquadraId: usuarios.playnaquadraAtletaId,
      atletaPago: inscricaoPagamentos.pago,
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

  const byCategoria = new Map<
    string,
    {
      categoriaId: string;
      categoriaNome: string;
      categoriaGenero: string;
      categoriaDataHorario: Date | null;
      atletas: Array<{
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
      }>;
    }
  >();
  const atletasJaIncluidos = new Set<string>();

  for (const r of rows) {
    if (atletasJaIncluidos.has(r.atletaId)) continue;
    atletasJaIncluidos.add(r.atletaId);

    const catId = r.categoriaId;
    if (!byCategoria.has(catId)) {
      byCategoria.set(catId, {
        categoriaId: r.categoriaId,
        categoriaNome: r.categoriaNome,
        categoriaGenero: r.categoriaGenero,
        categoriaDataHorario: r.categoriaDataHorario ?? null,
        atletas: [],
      });
    }
    byCategoria.get(catId)!.atletas.push({
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
      pago: Boolean(r.atletaPago),
    });
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
            equipeNome: montarNomeDupla(atleta.equipeNome, atletasPorEquipe.get(atleta.equipeId) ?? []),
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
