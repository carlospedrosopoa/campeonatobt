import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { bloqueioRecursoCapitaes } from "@/lib/capitaes-jogos";
import { db } from "@/db";
import { arenas, equipeIntegrantes, partidas, placarSubmissoes, rodadas } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { deveInvalidarCardPartida, excluirCardPartidaDoGcs } from "@/services/partida-card-cache.service";
import { erroForaDoPrazo } from "@/lib/prazo-agendamento";

const ERRO_TEM_PLACAR = "Não é possível alterar o agendamento de um jogo que já tem placar";

/** Jogo ja tem placar (oficial ou informado por atleta e pendente)? Ai o agendamento nao muda mais. */
async function jogoTemPlacar(partida: {
  id: string;
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: unknown;
}) {
  if (Array.isArray(partida.detalhesPlacar) && partida.detalhesPlacar.length > 0) return true;
  if (Number(partida.placarA ?? 0) > 0 || Number(partida.placarB ?? 0) > 0) return true;
  const [pendente] = await db
    .select({ id: placarSubmissoes.id })
    .from(placarSubmissoes)
    .where(and(eq(placarSubmissoes.partidaId, partida.id), eq(placarSubmissoes.status, "PENDENTE")))
    .limit(1);
  return Boolean(pendente);
}

/** Checagens comuns ao agendar/trocar e ao cancelar: atleta do jogo, recurso ligado, jogo sem resultado. */
async function carregarPartidaDoAtleta(request: NextRequest, partidaId: string) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

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
      placarA: partidas.placarA,
      placarB: partidas.placarB,
      detalhesPlacar: partidas.detalhesPlacar,
      rodadaDataLimite: rodadas.dataLimite,
    })
    .from(partidas)
    .leftJoin(rodadas, eq(rodadas.id, partidas.rodadaId))
    .where(eq(partidas.id, id))
    .limit(1);
  const partida = partidaRows[0];
  if (!partida) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  const bloqueio = await bloqueioRecursoCapitaes(id);
  if (bloqueio) return bloqueio;

  if (partida.status === "FINALIZADA" || partida.status === "WO") {
    return NextResponse.json({ error: "Não é possível alterar o agendamento de uma partida já encerrada" }, { status: 400 });
  }

  const equipesDaPartida = [partida.equipeAId, partida.equipeBId].filter(Boolean) as string[];
  const membroRows = await db
    .select({ equipeId: equipeIntegrantes.equipeId })
    .from(equipeIntegrantes)
    .where(and(eq(equipeIntegrantes.usuarioId, auth.user.id), inArray(equipeIntegrantes.equipeId, equipesDaPartida)))
    .limit(1);
  if (!membroRows[0]) return NextResponse.json({ error: "Você não participa desta partida" }, { status: 403 });

  if (await jogoTemPlacar(partida)) return NextResponse.json({ error: ERRO_TEM_PLACAR }, { status: 400 });

  return partida;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ partidaId: string }> }
) {
  const { partidaId } = await params;
  const partida = await carregarPartidaDoAtleta(request, partidaId);
  if (partida instanceof NextResponse) return partida;
  const id = partida.id;

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
  const foraDoPrazo = erroForaDoPrazo(dataHorario, partida.rodadaDataLimite);
  if (foraDoPrazo) return NextResponse.json({ error: foraDoPrazo }, { status: 400 });

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

/** Cancela o agendamento (data, arena e quadra); o jogo continua, so volta a ficar sem data. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ partidaId: string }> }
) {
  const { partidaId } = await params;
  const partida = await carregarPartidaDoAtleta(request, partidaId);
  if (partida instanceof NextResponse) return partida;

  const deveInvalidarCard = deveInvalidarCardPartida(partida, {
    dataHorario: null,
    arenaId: null,
    quadra: null,
    equipeAId: partida.equipeAId,
    equipeBId: partida.equipeBId,
  });

  const [updated] = await db
    .update(partidas)
    .set({
      dataHorario: null,
      arenaId: null,
      quadra: null,
      ...(deveInvalidarCard ? { fotoUrl: null } : {}),
      atualizadoEm: new Date(),
    })
    .where(eq(partidas.id, partida.id))
    .returning();

  if (deveInvalidarCard) {
    await excluirCardPartidaDoGcs(partida.fotoUrl);
  }

  return NextResponse.json(
    { ok: true, partida: updated },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
