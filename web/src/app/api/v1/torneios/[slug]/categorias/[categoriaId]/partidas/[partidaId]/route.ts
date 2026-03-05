import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { MataMataService } from "@/services/mata-mata.service";
import { db } from "@/db";
import { partidas } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { calcularResultadoSets } from "@/lib/regras-partida";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId, partidaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const partidaRows = await db
      .select({
        id: partidas.id,
        torneioId: partidas.torneioId,
        categoriaId: partidas.categoriaId,
        fase: partidas.fase,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);

    const partida = partidaRows[0];
    if (!partida) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    const body = await request.json().catch(() => null);
    const detalhesPlacar = Array.isArray(body?.detalhesPlacar) ? body.detalhesPlacar : [];

    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    const regras = config.regrasPartida ?? {
      tipo: "SETS" as const,
      melhorDe: 1 as const,
      gamesPorSet: 6 as const,
      tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
      superTiebreakDecisivo: { habilitado: false, ate: 10, diffMin: 2 },
      incluirSuperTieEmGames: false,
    };

    const resultado = calcularResultadoSets({
      regras,
      equipeAId: partida.equipeAId,
      equipeBId: partida.equipeBId,
      detalhesPlacar,
    });

    const [updated] = await db
      .update(partidas)
      .set({
        detalhesPlacar: resultado.detalhesPlacar as any,
        placarA: resultado.placarA,
        placarB: resultado.placarB,
        vencedorId: resultado.vencedorId,
        status: "FINALIZADA",
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, partidaId))
      .returning();

    let proximaFaseCriada: string | null = null;
    let partidasCriadas = 0;
    let proximaFaseAtualizada: string | null = null;
    let partidasAtualizadas = 0;
    if (partida.fase !== "GRUPOS") {
      const mataMataService = new MataMataService();
      const r = await mataMataService.sincronizarChaveAposAtualizacaoResultado({
        torneioId: torneio.id,
        categoriaId,
        faseAtual: partida.fase as any,
      });
      proximaFaseCriada = r.faseCriada ?? null;
      partidasCriadas = r.partidasCriadas ?? 0;
      proximaFaseAtualizada = r.faseAtualizada ?? null;
      partidasAtualizadas = r.partidasAtualizadas ?? 0;
    }

    return NextResponse.json({ partida: updated, proximaFaseCriada, partidasCriadas, proximaFaseAtualizada, partidasAtualizadas });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string; partidaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId, partidaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const body = await request.json();
    const { fotoUrl, transmissaoUrl } = body;

    const [updated] = await db
      .update(partidas)
      .set({
        fotoUrl,
        transmissaoUrl,
        atualizadoEm: new Date(),
      })
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao atualizar partida" }, { status: 500 });
  }
}
