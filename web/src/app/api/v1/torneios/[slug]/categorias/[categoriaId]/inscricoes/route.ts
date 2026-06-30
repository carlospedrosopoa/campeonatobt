import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { inscricoesService } from "@/services/inscricoes.service";

export async function GET(
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

    const lista = await inscricoesService.listarPorCategoria(categoriaId);
    return NextResponse.json(lista);
  } catch (error) {
    console.error("Erro ao listar inscriÃ§Ãµes:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

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

    const equipeNome = (body?.equipeNome as string | undefined)?.trim();
    const status = body?.status as "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA" | undefined;

    const atletaA = body?.atletaA as { nome?: string; email?: string; telefone?: string; playnaquadraAtletaId?: string; fotoUrl?: string; camisetaOpcao?: string | null } | undefined;
    const atletaB = body?.atletaB as { nome?: string; email?: string; telefone?: string; playnaquadraAtletaId?: string; fotoUrl?: string; camisetaOpcao?: string | null } | undefined;

    if (!atletaA?.nome || !atletaA?.email || !atletaB?.nome || !atletaB?.email) {
      return NextResponse.json({ error: "Dados dos dois atletas sÃ£o obrigatÃ³rios" }, { status: 400 });
    }

    const nova = await inscricoesService.criar({
      torneioId: torneio.id,
      categoriaId,
      equipeNome,
      status,
      atletaA: { nome: atletaA.nome, email: atletaA.email, telefone: atletaA.telefone, playnaquadraAtletaId: atletaA.playnaquadraAtletaId, fotoUrl: atletaA.fotoUrl, camisetaOpcao: atletaA.camisetaOpcao ?? null },
      atletaB: { nome: atletaB.nome, email: atletaB.email, telefone: atletaB.telefone, playnaquadraAtletaId: atletaB.playnaquadraAtletaId, fotoUrl: atletaB.fotoUrl, camisetaOpcao: atletaB.camisetaOpcao ?? null },
    });

    return NextResponse.json(nova, { status: 201 });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    const status = msg.includes("jÃ¡ estÃ¡ inscrito") || msg.includes("Atletas precisam ser diferentes") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}


