import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricoes, usuarios } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;
  if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { slug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);
  if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

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
      inscricaoId: inscricoes.id,
      inscricaoStatus: inscricoes.status,
      equipeId: equipes.id,
      equipeNome: equipes.nome,
      atletaId: usuarios.id,
      atletaNome: usuarios.nome,
      atletaEmail: usuarios.email,
      atletaTelefone: usuarios.telefone,
    })
    .from(inscricoes)
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
    .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
    .where(and(eq(inscricoes.torneioId, torneio.id), inArray(inscricoes.status, statusesFiltro as any)))
    .orderBy(asc(categorias.nome), asc(usuarios.nome));

  const byCategoria = new Map<
    string,
    {
      categoriaId: string;
      categoriaNome: string;
      categoriaGenero: string;
      atletas: Array<{
        atletaId: string;
        atletaNome: string;
        atletaEmail: string;
        atletaTelefone: string | null;
        equipeId: string;
        equipeNome: string | null;
        inscricaoId: string;
        inscricaoStatus: string;
      }>;
    }
  >();

  for (const r of rows) {
    const catId = r.categoriaId;
    if (!byCategoria.has(catId)) {
      byCategoria.set(catId, {
        categoriaId: r.categoriaId,
        categoriaNome: r.categoriaNome,
        categoriaGenero: r.categoriaGenero,
        atletas: [],
      });
    }
    byCategoria.get(catId)!.atletas.push({
      atletaId: r.atletaId,
      atletaNome: r.atletaNome,
      atletaEmail: r.atletaEmail,
      atletaTelefone: r.atletaTelefone ?? null,
      equipeId: r.equipeId,
      equipeNome: r.equipeNome ?? null,
      inscricaoId: r.inscricaoId,
      inscricaoStatus: r.inscricaoStatus,
    });
  }

  const categoriasResult = Array.from(byCategoria.values())
    .sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome))
    .map((c) => ({
      ...c,
      atletas: c.atletas.slice().sort((a, b) => a.atletaNome.localeCompare(b.atletaNome)),
    }));

  return NextResponse.json(
    { torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug }, categorias: categoriasResult },
    { headers: { "Cache-Control": "no-store" } }
  );
}

