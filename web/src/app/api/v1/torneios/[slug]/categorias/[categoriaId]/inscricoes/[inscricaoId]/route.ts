import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { inscricoesService } from "@/services/inscricoes.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; inscricaoId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId, inscricaoId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const del = await inscricoesService.excluir(inscricaoId);
    if (!del) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir inscrição:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; inscricaoId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId, inscricaoId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const equipeNome = body?.equipeNome as string | null | undefined;
    const status = body?.status as "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA" | undefined;

    const atletaA = body?.atletaA as { nome?: string; email?: string; telefone?: string; playnaquadraAtletaId?: string; fotoUrl?: string } | undefined;
    const atletaB = body?.atletaB as { nome?: string; email?: string; telefone?: string; playnaquadraAtletaId?: string; fotoUrl?: string } | undefined;

    if (!atletaA?.nome || !atletaA?.email || !atletaB?.nome || !atletaB?.email) {
      return NextResponse.json({ error: "Dados dos dois atletas são obrigatórios" }, { status: 400 });
    }

    await inscricoesService.atualizar(inscricaoId, {
      torneioId: torneio.id,
      categoriaId,
      equipeNome: equipeNome === undefined ? undefined : equipeNome,
      status,
      atletaA: { nome: atletaA.nome, email: atletaA.email, telefone: atletaA.telefone, playnaquadraAtletaId: atletaA.playnaquadraAtletaId, fotoUrl: atletaA.fotoUrl },
      atletaB: { nome: atletaB.nome, email: atletaB.email, telefone: atletaB.telefone, playnaquadraAtletaId: atletaB.playnaquadraAtletaId, fotoUrl: atletaB.fotoUrl },
    });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    const status = msg.includes("já está inscrito") || msg.includes("Atletas precisam ser diferentes") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
