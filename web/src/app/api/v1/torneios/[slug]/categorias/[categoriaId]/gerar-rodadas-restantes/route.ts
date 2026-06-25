import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { dinamicaCategoriaService } from "@/services/dinamica-categoria.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const aPartirDaRodada = Number(body?.aPartirDaRodada ?? 2);

    const resultado = await dinamicaCategoriaService.gerarRodadasRestantesSuperCampeonato({
      torneioId: torneio.id,
      categoriaId,
      aPartirDaRodada: Number.isFinite(aPartirDaRodada) && aPartirDaRodada >= 2 ? aPartirDaRodada : 2,
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    const status = msg.includes("NÃ£o Ã© possÃ­vel") || msg.includes("invÃ¡lida") || msg.includes("Nenhum confronto") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}


