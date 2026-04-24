import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, esportes, inscricoes, partidas, torneios } from "@/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      torneioId: torneios.id,
      torneioNome: torneios.nome,
      torneioSlug: torneios.slug,
      torneioDescricao: torneios.descricao,
      torneioDataInicio: torneios.dataInicio,
      torneioDataFim: torneios.dataFim,
      torneioLocal: torneios.local,
      torneioStatus: torneios.status,
      torneioBannerUrl: torneios.bannerUrl,
      torneioLogoUrl: torneios.logoUrl,
      torneioSuperCampeonato: torneios.superCampeonato,
      esporteNome: esportes.nome,
      categoriaId: categorias.id,
      categoriaNome: categorias.nome,
      categoriaSlug: categorias.slug,
      categoriaGenero: categorias.genero,
      categoriaValorInscricao: categorias.valorInscricao,
      categoriaVagasMaximas: categorias.vagasMaximas,
      categoriaPartidasGeradas: sql<number>`count(distinct ${partidas.id})`.as("categoria_partidas_geradas"),
      categoriaInscritos: sql<number>`count(distinct ${inscricoes.id})`.as("categoria_inscritos"),
    })
    .from(torneios)
    .leftJoin(esportes, eq(torneios.esporteId, esportes.id))
    .leftJoin(categorias, eq(categorias.torneioId, torneios.id))
    .leftJoin(partidas, eq(partidas.categoriaId, categorias.id))
    .leftJoin(inscricoes, eq(inscricoes.categoriaId, categorias.id))
    .where(inArray(torneios.status, ["ABERTO", "EM_ANDAMENTO"]))
    .groupBy(torneios.id, esportes.nome, categorias.id)
    .orderBy(desc(torneios.criadoEm));

  const map = new Map<
    string,
    {
      id: string;
      nome: string;
      slug: string;
      descricao: string | null;
      dataInicio: any;
      dataFim: any;
      local: string;
      status: string;
      bannerUrl: string | null;
      logoUrl: string | null;
      superCampeonato: boolean;
      esporteNome: string | null;
      categorias: {
        id: string;
        nome: string;
        genero: string;
        valorInscricao: string | null;
        vagasMaximas: number | null;
        inscricoesAbertas: boolean;
      }[];
    }
  >();

  for (const r of rows) {
    const key = r.torneioId;
    const current =
      map.get(key) ??
      ({
        id: r.torneioId,
        nome: r.torneioNome,
        slug: r.torneioSlug,
        descricao: r.torneioDescricao ?? null,
        dataInicio: r.torneioDataInicio,
        dataFim: r.torneioDataFim,
        local: r.torneioLocal,
        status: r.torneioStatus,
        bannerUrl: r.torneioBannerUrl ?? null,
        logoUrl: r.torneioLogoUrl ?? null,
        superCampeonato: Boolean(r.torneioSuperCampeonato),
        esporteNome: r.esporteNome ?? null,
        categorias: [],
      } as any);

    if (!map.has(key)) map.set(key, current);

    if (r.categoriaId) {
      current.categorias.push({
        id: r.categoriaId,
        nome: r.categoriaNome ?? "",
        slug: r.categoriaSlug ?? "",
        genero: r.categoriaGenero ?? "",
        valorInscricao: r.categoriaValorInscricao ?? null,
        vagasMaximas: r.categoriaVagasMaximas ?? null,
        inscritos: Number(r.categoriaInscritos || 0),
        inscricoesAbertas: Number(r.categoriaPartidasGeradas || 0) === 0,
      });
    }
  }

  return NextResponse.json(Array.from(map.values()), { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}
