import { NextRequest, NextResponse } from "next/server";
import { ApoiadoresService } from "@/services/apoiadores.service";
import { torneiosService } from "@/services/torneios.service";
import { requireUser } from "@/lib/auth-request";

const apoiadoresService = new ApoiadoresService();

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string; id: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const params = await props.params;
  const torneio = await torneiosService.buscarPorSlug(params.slug);

  if (!torneio) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  }

  const apoiador = await apoiadoresService.buscarPorId(params.id);
  if (!apoiador || apoiador.torneioId !== torneio.id) {
    return NextResponse.json({ error: "Apoiador não encontrado" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const atualizado = await apoiadoresService.atualizar(params.id, {
      nome: body.nome,
      logoUrl: body.logoUrl,
      slogan: body.slogan,
      endereco: body.endereco,
      latitude: body.latitude,
      longitude: body.longitude,
      siteUrl: body.siteUrl,
    });

    return NextResponse.json(atualizado);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string; id: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const params = await props.params;
  const torneio = await torneiosService.buscarPorSlug(params.slug);

  if (!torneio) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  }

  const apoiador = await apoiadoresService.buscarPorId(params.id);
  if (!apoiador || apoiador.torneioId !== torneio.id) {
    return NextResponse.json({ error: "Apoiador não encontrado" }, { status: 404 });
  }

  try {
    await apoiadoresService.excluir(params.id);
    return NextResponse.json({ message: "Apoiador excluído com sucesso" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}
