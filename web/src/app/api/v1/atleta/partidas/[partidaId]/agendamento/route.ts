import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { arenas, equipeIntegrantes, equipes, partidas } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { deveInvalidarCardPartida, excluirCardPartidaDoGcs } from "@/services/partida-card-cache.service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ partidaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { partidaId } = await params;
  const id = (partidaId || "").trim();
  if (!id) return NextResponse.json({ error: "partidaId inválido" }, { status: 400 });

  const partidaRows = await db
    .select({
      id: partidas.id,
      torneioId: partidas.torneioId,
      categoriaId: partidas.categoriaId,
      status: partidas.status,
      fotoUrl: partidas.fotoUrl,
      arenaId: partidas.arenaId,
      quadra: partidas.quadra,
      dataHorario: partidas.dataHorario,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
    })
    .from(partidas)
    .where(eq(partidas.id, id))
    .limit(1);
  const partida = partidaRows[0];
  if (!partida) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  if (partida.status === "FINALIZADA" || partida.status === "WO") {
    return NextResponse.json({ error: "Não é possível agendar uma partida já encerrada" }, { status: 400 });
  }

  const equipesDaPartida = [partida.equipeAId, partida.equipeBId].filter(Boolean) as string[];
  const membroRows = await db
    .select({ equipeId: equipeIntegrantes.equipeId })
    .from(equipeIntegrantes)
    .where(and(eq(equipeIntegrantes.usuarioId, auth.user.id), inArray(equipeIntegrantes.equipeId, equipesDaPartida)))
    .limit(1);
  if (!membroRows[0]) return NextResponse.json({ error: "Você não participa desta partida" }, { status: 403 });

  const capitaoRows = await db
    .select({ id: equipes.id, capitaoUsuarioId: equipes.capitaoUsuarioId })
    .from(equipes)
    .where(inArray(equipes.id, equipesDaPartida));
  const souCapitao = capitaoRows.some((equipe) => equipe.capitaoUsuarioId === auth.user.id);
  if (!souCapitao) {
    return NextResponse.json({ error: "Somente o capitão pode definir data, hora e arena do jogo" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as any;
  const arenaId = typeof body?.arenaId === "string" ? body.arenaId.trim() : "";
  const quadra = typeof body?.quadra === "string" ? body.quadra.trim() : "";
  const dataHorarioRaw = typeof body?.dataHorario === "string" ? body.dataHorario.trim() : "";

  if (!arenaId) return NextResponse.json({ error: "Arena é obrigatória" }, { status: 400 });
  if (!dataHorarioRaw) return NextResponse.json({ error: "Data e hora são obrigatórias" }, { status: 400 });

  const arenaRows = await db
    .select({ id: arenas.id })
    .from(arenas)
    .where(and(eq(arenas.id, arenaId), eq(arenas.torneioId, partida.torneioId)))
    .limit(1);
  if (!arenaRows[0]) return NextResponse.json({ error: "Arena inválida para o torneio" }, { status: 400 });

  const dataHorario = new Date(dataHorarioRaw);
  if (Number.isNaN(dataHorario.getTime())) {
    return NextResponse.json({ error: "Data/hora inválida" }, { status: 400 });
  }

  const quadraNormalizada = quadra || null;
  const deveInvalidarCard = deveInvalidarCardPartida(partida, {
    dataHorario,
    arenaId,
    quadra: quadraNormalizada,
    equipeAId: partida.equipeAId,
    equipeBId: partida.equipeBId,
  });

  const [updated] = await db
    .update(partidas)
    .set({
      arenaId,
      quadra: quadraNormalizada,
      dataHorario,
      ...(deveInvalidarCard ? { fotoUrl: null } : {}),
      atualizadoEm: new Date(),
    })
    .where(eq(partidas.id, id))
    .returning();

  if (deveInvalidarCard) {
    await excluirCardPartidaDoGcs(partida.fotoUrl);
  }

  return NextResponse.json(
    { ok: true, partida: updated },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
