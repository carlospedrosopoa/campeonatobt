import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth-request";
import { db } from "@/db";
import { equipeIntegrantes, equipes, inscricoes } from "@/db/schema";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { inscricoesService } from "@/services/inscricoes.service";
import { and, eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    if (torneio.oculto) {
      const user = await getUserFromRequest(request);
      if (!user) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
      if (user.perfil === "ATLETA") {
        const membership = await db
          .select({ inscricaoId: inscricoes.id })
          .from(inscricoes)
          .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
          .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
          .where(and(eq(inscricoes.torneioId, torneio.id), eq(inscricoes.categoriaId, categoriaId), eq(equipeIntegrantes.usuarioId, user.id)))
          .limit(1);
        if (membership.length === 0) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
      }
    }

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const lista = await inscricoesService.listarPorCategoria(categoriaId);
    return NextResponse.json(lista, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error) {
    console.error("Erro ao obter inscritos:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
