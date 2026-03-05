import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { getSession } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categorias = await categoriasService.listarPorTorneio(torneio.id);
    return NextResponse.json(categorias);
  } catch (error) {
    console.error("Erro ao listar categorias:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    const permitido = perfil === "ADMIN" || perfil === "ORGANIZADOR";
    if (!permitido) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const nome = (body?.nome as string | undefined)?.trim();
    const genero = body?.genero as "MASCULINO" | "FEMININO" | "MISTO" | undefined;
    const valorInscricao = body?.valorInscricao as string | number | undefined;
    const vagasMaximas = body?.vagasMaximas as number | null | undefined;

    if (!nome || !genero) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const nova = await categoriasService.criar({
      torneioId: torneio.id,
      nome,
      genero,
      valorInscricao,
      vagasMaximas,
    });

    return NextResponse.json(nova, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

