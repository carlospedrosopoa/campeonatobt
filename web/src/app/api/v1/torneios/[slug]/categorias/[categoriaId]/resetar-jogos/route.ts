import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
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

    await dinamicaCategoriaService.excluirJogos({ torneioId: torneio.id, categoriaId });

    return NextResponse.json({ message: "Jogos resetados com sucesso" });
  } catch (error: any) {
    console.error("Erro ao resetar jogos:", error);
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}

