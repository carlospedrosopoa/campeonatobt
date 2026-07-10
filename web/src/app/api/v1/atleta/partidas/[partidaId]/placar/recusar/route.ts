import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { equipeIntegrantes, equipes, partidas, placarSubmissoes } from "@/db/schema";
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

  const membro = await db
    .select({ id: equipeIntegrantes.id })
    .from(equipeIntegrantes)
    .where(and(eq(equipeIntegrantes.usuarioId, auth.user.id), inArray(equipeIntegrantes.equipeId, [partida.equipeAId, partida.equipeBId])))
    .limit(1);
  if (!membro[0]) return NextResponse.json({ error: "Você não faz parte desta partida" }, { status: 403 });

  const equipesRows = await db
    .select({
      id: equipes.id,
      capitaoUsuarioId: equipes.capitaoUsuarioId,
    })
    .from(equipes)
    .where(inArray(equipes.id, [partida.equipeAId, partida.equipeBId]));

  const getCapitao = async (equipeId: string) => {
    const row = equipesRows.find((x) => x.id === equipeId);
    if (row?.capitaoUsuarioId) return row.capitaoUsuarioId;
    const [fallback] = await db
      .select({ usuarioId: equipeIntegrantes.usuarioId })
      .from(equipeIntegrantes)
      .where(eq(equipeIntegrantes.equipeId, equipeId))
      .limit(1);
    return fallback?.usuarioId ?? null;
  };

  const capitaoEquipeAId = await getCapitao(partida.equipeAId);
  const capitaoEquipeBId = await getCapitao(partida.equipeBId);
  const isCapitaoA = capitaoEquipeAId === auth.user.id;
  const isCapitaoB = capitaoEquipeBId === auth.user.id;
  if (!isCapitaoA && !isCapitaoB) {
    return NextResponse.json({ error: "Apenas o capitão da dupla pode recusar o placar" }, { status: 403 });
  }

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

  if (pendente.usuarioId === auth.user.id) {
    return NextResponse.json({ error: "O capitão que informou o placar não pode recusar. Use limpar/zerar." }, { status: 400 });
  }

  await db
    .update(placarSubmissoes)
    .set({
      status: "CANCELADA",
      canceladoEm: new Date(),
      canceladoMotivo: "Recusado pelo capitão da dupla adversária",
      atualizadoEm: new Date(),
    })
    .where(eq(placarSubmissoes.id, pendente.id));

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

