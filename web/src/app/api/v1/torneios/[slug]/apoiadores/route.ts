import { NextRequest, NextResponse } from "next/server";
import { ApoiadoresService } from "@/services/apoiadores.service";
import { torneiosService } from "@/services/torneios.service";
import { requireUser } from "@/lib/auth-request";

const apoiadoresService = new ApoiadoresService();

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  const params = await props.params;
  const torneio = await torneiosService.buscarPorSlug(params.slug);

  if (!torneio) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  }

  const apoiadores = await apoiadoresService.listarPorTorneio(torneio.id);
  return NextResponse.json(apoiadores);
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const params = await props.params;
  const torneio = await torneiosService.buscarPorSlug(params.slug);

  if (!torneio) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  }

  try {
    const body = await request.json();

    if (!body.nome) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }

    const novo = await apoiadoresService.criar({
      torneioId: torneio.id,
      nome: body.nome,
      logoUrl: body.logoUrl,
      slogan: body.slogan,
      endereco: body.endereco,
      latitude: body.latitude,
      longitude: body.longitude,
      siteUrl: body.siteUrl,
    });

    return NextResponse.json(novo, { status: 201 });
  } catch (error: any) {
    console.error("Erro ao criar apoiador:", error);
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}
