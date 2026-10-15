import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { bloqueioRecursoCapitaes, equipeDoAtletaNaPartida } from "@/lib/capitaes-jogos";
import { db } from "@/db";
import { categorias, equipeIntegrantes, partidas, placarSubmissoes, torneios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ErroPlacar, placarSubmissoesService } from "@/services/placar-submissoes.service";

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
      torneioId: partidas.torneioId,
      categoriaId: partidas.categoriaId,
      fase: partidas.fase,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
      status: partidas.status,
      superCampeonato: torneios.superCampeonato,
      superCampeonatoFormato: torneios.superCampeonatoFormato,
      torneioNome: torneios.nome,
      torneioSlug: torneios.slug,
      categoriaNome: categorias.nome,
    })
    .from(partidas)
    .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
    .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
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
      detalhesPlacar: placarSubmissoes.detalhesPlacar,
      vencedorId: placarSubmissoes.vencedorId,
    })
    .from(placarSubmissoes)
    .where(and(eq(placarSubmissoes.partidaId, partidaId), eq(placarSubmissoes.status, "PENDENTE")))
    .limit(1);
  const pendente = pendenteRows[0];
  if (!pendente) return NextResponse.json({ error: "Não existe placar pendente para confirmar" }, { status: 404 });

  const equipeVencedoraId = pendente.vencedorId;
  const equipePerdedoraId =
    equipeVencedoraId === partida.equipeAId ? partida.equipeBId : equipeVencedoraId === partida.equipeBId ? partida.equipeAId : null;
  if (!equipePerdedoraId) return NextResponse.json({ error: "Placar pendente inválido (sem vencedor)" }, { status: 400 });

  // confirma quem e da outra dupla (nao a dupla que informou)
  const [minhaEquipeId, equipeDoInformante] = await Promise.all([
    equipeDoAtletaNaPartida(auth.user.id, [partida.equipeAId, partida.equipeBId]),
    equipeDoAtletaNaPartida(pendente.usuarioId, [partida.equipeAId, partida.equipeBId]),
  ]);
  if (!minhaEquipeId || minhaEquipeId === equipeDoInformante) {
    return NextResponse.json({ error: "Quem confirma o placar é a dupla adversária" }, { status: 403 });
  }

  try {
    const updated = await placarSubmissoesService.confirmarPendente({ partidaId, confirmadoPorUsuarioId: auth.user.id });
    return NextResponse.json({ ok: true, partida: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErroPlacar) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

