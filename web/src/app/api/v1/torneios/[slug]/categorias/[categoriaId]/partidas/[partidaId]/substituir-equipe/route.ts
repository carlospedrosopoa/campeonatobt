import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { db } from "@/db";
import { inscricoes } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { mataMataService } from "@/services/mata-mata.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId, partidaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const equipeOrigemId = (body?.equipeOrigemId as string | undefined)?.trim();
    const equipeDestinoId = (body?.equipeDestinoId as string | undefined)?.trim();
    if (!equipeOrigemId || !equipeDestinoId) {
      return NextResponse.json({ error: "Informe a dupla atual e a nova dupla" }, { status: 400 });
    }
    if (equipeOrigemId === equipeDestinoId) {
      return NextResponse.json({ error: "Escolha uma dupla diferente para substituir" }, { status: 400 });
    }

    const aprovadas = await db
      .select({ equipeId: inscricoes.equipeId })
      .from(inscricoes)
      .where(
        and(
          eq(inscricoes.torneioId, torneio.id),
          eq(inscricoes.categoriaId, categoriaId),
          eq(inscricoes.status, "APROVADA"),
          inArray(inscricoes.equipeId, [equipeOrigemId, equipeDestinoId])
        )
      )
      .limit(2);

    if (aprovadas.length !== 2) {
      return NextResponse.json({ error: "Uma das duplas não está aprovada na categoria" }, { status: 400 });
    }

    const result = await mataMataService.substituirEquipeNaFase({
      torneioId: torneio.id,
      categoriaId,
      partidaId,
      equipeOrigemId,
      equipeDestinoId,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
