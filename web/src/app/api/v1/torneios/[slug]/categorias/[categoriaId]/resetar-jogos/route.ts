import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { dinamicaCategoriaService } from "@/services/dinamica-categoria.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const session = await getSession();
    if (!isAdmin(session?.user?.perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    await dinamicaCategoriaService.excluirJogos({ torneioId: torneio.id, categoriaId });

    return NextResponse.json({ message: "Jogos resetados com sucesso" });
  } catch (error: any) {
    console.error("Erro ao resetar jogos:", error);
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}
