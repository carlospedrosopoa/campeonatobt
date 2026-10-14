import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { equipeIntegrantes, partidas, torneios } from "@/db/schema";

/**
 * Agendar jogo e informar/confirmar placar pelo app so valem na competicao com a flag
 * `capitaesGerenciamJogos` ligada. Devolve a resposta 403 quando o recurso esta desligado.
 */
export async function bloqueioRecursoCapitaes(partidaId: string): Promise<NextResponse | null> {
  const [row] = await db
    .select({ habilitado: torneios.capitaesGerenciamJogos })
    .from(partidas)
    .innerJoin(torneios, eq(torneios.id, partidas.torneioId))
    .where(eq(partidas.id, partidaId))
    .limit(1);
  if (!row || row.habilitado) return null;
  return NextResponse.json(
    { error: "Nesta competição o agendamento e o placar são feitos pela organização.", code: "RECURSO_CAPITAES_DESATIVADO" },
    { status: 403 }
  );
}

/** Dupla (equipe) do jogo em que o atleta esta, ou null se ele nao joga essa partida. */
export async function equipeDoAtletaNaPartida(usuarioId: string, equipeIds: string[]): Promise<string | null> {
  const [row] = await db
    .select({ equipeId: equipeIntegrantes.equipeId })
    .from(equipeIntegrantes)
    .where(and(eq(equipeIntegrantes.usuarioId, usuarioId), inArray(equipeIntegrantes.equipeId, equipeIds)))
    .limit(1);
  return row?.equipeId ?? null;
}
