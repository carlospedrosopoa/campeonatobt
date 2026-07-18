import { NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { categoriasService } from "@/services/categorias.service";
import { PartidaHeadToHeadService } from "@/services/partida-head-to-head.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const { slug, categoriaId, partidaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const service = new PartidaHeadToHeadService();
    const data = await service.gerarPorPartida({
      partidaId,
      torneioId: torneio.id,
      categoriaId,
    });

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
