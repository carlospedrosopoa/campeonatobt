import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { bloqueioRecursoCapitaes, equipeDoAtletaNaPartida } from "@/lib/capitaes-jogos";
import { db } from "@/db";
import { equipeIntegrantes, partidas, placarSubmissoes } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ partidaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { partidaId } = await params;

  const partidaRows = await db
    .select({
      id: partidas.id,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
    })
    .from(partidas)
    .where(eq(partidas.id, partidaId))
    .limit(1);
  const partida = partidaRows[0];
  if (!partida) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  const bloqueio = await bloqueioRecursoCapitaes(partidaId);
  if (bloqueio) return bloqueio;

  const membro = await db
    .select({ id: equipeIntegrantes.id })
    .from(equipeIntegrantes)
    .where(and(eq(equipeIntegrantes.usuarioId, auth.user.id), inArray(equipeIntegrantes.equipeId, [partida.equipeAId, partida.equipeBId])))
    .limit(1);
  if (!membro[0]) return NextResponse.json({ error: "Você não faz parte desta partida" }, { status: 403 });


  const pendenteRows = await db
    .select({
      id: placarSubmissoes.id,
      usuarioId: placarSubmissoes.usuarioId,
    })
    .from(placarSubmissoes)
    .where(and(eq(placarSubmissoes.partidaId, partidaId), eq(placarSubmissoes.status, "PENDENTE")))
    .limit(1);
  const pendente = pendenteRows[0];
  if (!pendente) return NextResponse.json({ error: "Não existe placar pendente para recusar" }, { status: 404 });

  const [minhaEquipeId, equipeDoInformante] = await Promise.all([
    equipeDoAtletaNaPartida(auth.user.id, [partida.equipeAId, partida.equipeBId]),
    equipeDoAtletaNaPartida(pendente.usuarioId, [partida.equipeAId, partida.equipeBId]),
  ]);
  if (!minhaEquipeId || minhaEquipeId === equipeDoInformante) {
    return NextResponse.json({ error: "Quem informou não recusa: use editar ou zerar. A recusa é da dupla adversária." }, { status: 400 });
  }

  await db
    .update(placarSubmissoes)
    .set({
      status: "CANCELADA",
      canceladoEm: new Date(),
      canceladoMotivo: "Recusado pela dupla adversária",
      atualizadoEm: new Date(),
    })
    .where(eq(placarSubmissoes.id, pendente.id));

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

