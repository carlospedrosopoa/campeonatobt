import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { dinamicaCategoriaService } from "@/services/dinamica-categoria.service";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { db } from "@/db";
import { partidas } from "@/db/schema";
import { eq } from "drizzle-orm";

function partidaIniciada(p: { status?: any; vencedorId?: any; placarA?: any; placarB?: any; detalhesPlacar?: any }) {
  if (p.status && p.status !== "AGENDADA") return true;
  if (p.vencedorId) return true;
  if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
  if (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0) return true;
  return false;
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

    const partidasExistentes = await db
      .select({
        id: partidas.id,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(eq(partidas.categoriaId, categoriaId));

    if (partidasExistentes.some(partidaIniciada)) {
      return NextResponse.json(
        { error: "NÃ£o Ã© permitido gerar jogos: jÃ¡ existem partidas com resultado ou em andamento nesta categoria." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    if (body) {
      await categoriaConfigService.salvar(categoriaId, body);
    }

    const resultado = await dinamicaCategoriaService.gerarGruposEJogos({ torneioId: torneio.id, categoriaId });
    return NextResponse.json(resultado);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

