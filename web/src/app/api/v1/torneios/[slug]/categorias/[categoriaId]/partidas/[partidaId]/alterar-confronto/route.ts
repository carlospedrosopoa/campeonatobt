import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { db } from "@/db";
import { inscricoes, partidas } from "@/db/schema";
import { and, eq, inArray, not, or } from "drizzle-orm";
import { MataMataService } from "@/services/mata-mata.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function POST(
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

    const body = await request.json().catch(() => null);
    const equipeAId = (body?.equipeAId as string | undefined)?.trim();
    const equipeBId = (body?.equipeBId as string | undefined)?.trim();
    const force = Boolean(body?.force);
    const preservarPlacar = body?.preservarPlacar !== undefined ? Boolean(body?.preservarPlacar) : true;
    if (!equipeAId || !equipeBId) return NextResponse.json({ error: "Informe as duas duplas" }, { status: 400 });
    if (equipeAId === equipeBId) return NextResponse.json({ error: "Duplas precisam ser diferentes" }, { status: 400 });

    const partidaRows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        vencedorId: partidas.vencedorId,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
        rodadaId: partidas.rodadaId,
        grupoId: partidas.grupoId,
      })
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), eq(partidas.torneioId, torneio.id), eq(partidas.categoriaId, categoriaId)))
      .limit(1);
    const partida = partidaRows[0];
    if (!partida) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    const started =
      partida.status !== "AGENDADA" ||
      Boolean(partida.vencedorId) ||
      (partida.placarA ?? 0) !== 0 ||
      (partida.placarB ?? 0) !== 0 ||
      (Array.isArray(partida.detalhesPlacar) && partida.detalhesPlacar.length > 0);

    if (partida.fase === "GRUPOS") {
      const isSuperCampeonato = Boolean((torneio as any)?.superCampeonato);
      if (!isSuperCampeonato) {
        return NextResponse.json({ error: "Alteração de confronto em GRUPOS é permitida apenas no Super Campeonato" }, { status: 400 });
      }
      if (!partida.rodadaId || !partida.grupoId) {
        return NextResponse.json({ error: "Partida inválida (sem rodada/grupo)" }, { status: 400 });
      }
      if (started && !force) {
        return NextResponse.json(
          { error: "Partida já possui placar/andamento. Para alterar o confronto, confirme a ação." },
          { status: 400 }
        );
      }
    } else {
      if (started) return NextResponse.json({ error: "Não é possível alterar confronto após iniciar/lançar placar" }, { status: 400 });
    }

    const aprovadas = await db
      .select({ equipeId: inscricoes.equipeId })
      .from(inscricoes)
      .where(
        and(
          eq(inscricoes.torneioId, torneio.id),
          eq(inscricoes.categoriaId, categoriaId),
          eq(inscricoes.status, "APROVADA"),
          inArray(inscricoes.equipeId, [equipeAId, equipeBId])
        )
      )
      .limit(2);
    if (aprovadas.length !== 2) return NextResponse.json({ error: "Uma das duplas não está aprovada na categoria" }, { status: 400 });

    const conflitoWhere = [
      eq(partidas.torneioId, torneio.id),
      eq(partidas.categoriaId, categoriaId),
      eq(partidas.fase, partida.fase),
      not(eq(partidas.id, partidaId)),
      or(inArray(partidas.equipeAId, [equipeAId, equipeBId]), inArray(partidas.equipeBId, [equipeAId, equipeBId])),
    ];
    if (partida.fase === "GRUPOS") {
      conflitoWhere.push(eq(partidas.rodadaId, partida.rodadaId as string));
      conflitoWhere.push(eq(partidas.grupoId, partida.grupoId as string));
    }

    const conflito = await db.select({ id: partidas.id }).from(partidas).where(and(...conflitoWhere)).limit(1);
    if (conflito.length > 0) return NextResponse.json({ error: "Uma das duplas já está em outro jogo desta fase" }, { status: 400 });

    const updated = await db.transaction(async (tx) => {
      if (partida.fase === "GRUPOS" && started && preservarPlacar) {
        const setsA = partida.placarA ?? 0;
        const setsB = partida.placarB ?? 0;
        const vencedorId = setsA === setsB ? null : setsA > setsB ? equipeAId : equipeBId;
        const [u] = await tx
          .update(partidas)
          .set({
            equipeAId,
            equipeBId,
            vencedorId,
            atualizadoEm: new Date(),
          })
          .where(eq(partidas.id, partidaId))
          .returning();
        return u;
      }

      const [u] = await tx
        .update(partidas)
        .set({
          equipeAId,
          equipeBId,
          vencedorId: null,
          placarA: 0,
          placarB: 0,
          detalhesPlacar: null as any,
          status: "AGENDADA",
          atualizadoEm: new Date(),
        })
        .where(eq(partidas.id, partidaId))
        .returning();
      return u;
    });

    if (partida.fase !== "GRUPOS") {
      const mataMataService = new MataMataService();
      await mataMataService.resetarChaveDepoisDeFaseSePossivel({
        torneioId: torneio.id,
        categoriaId,
        faseAtual: partida.fase as any,
      });
    }

    return NextResponse.json({ partida: updated });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
