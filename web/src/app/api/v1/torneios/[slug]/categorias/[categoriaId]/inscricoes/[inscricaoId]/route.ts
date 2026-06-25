import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { inscricoesService } from "@/services/inscricoes.service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; inscricaoId: string }> }
) {
  try {
    const { slug, categoriaId, inscricaoId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    const del = await inscricoesService.excluir(inscricaoId);
    if (!del) return NextResponse.json({ error: "InscriÃ§Ã£o nÃ£o encontrada" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir inscriÃ§Ã£o:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; inscricaoId: string }> }
) {
  try {
    const { slug, categoriaId, inscricaoId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const equipeNome = body?.equipeNome as string | null | undefined;
    const status = body?.status as "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA" | undefined;

    const atletaA = body?.atletaA as { nome?: string; email?: string; telefone?: string; playnaquadraAtletaId?: string; fotoUrl?: string } | undefined;
    const atletaB = body?.atletaB as { nome?: string; email?: string; telefone?: string; playnaquadraAtletaId?: string; fotoUrl?: string } | undefined;

    if (!atletaA?.nome || !atletaA?.email || !atletaB?.nome || !atletaB?.email) {
      return NextResponse.json({ error: "Dados dos dois atletas sÃ£o obrigatÃ³rios" }, { status: 400 });
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
    const status = msg.includes("jÃ¡ estÃ¡ inscrito") || msg.includes("Atletas precisam ser diferentes") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

