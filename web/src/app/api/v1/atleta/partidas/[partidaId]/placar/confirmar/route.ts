import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, partidas, placarSubmissoes, torneios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";
import { MataMataService } from "@/services/mata-mata.service";
import { calcularResultadoPartida, obterRegrasPartidaEfetivas } from "@/lib/regras-partida";

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

  const capitaoPerdedor =
    equipePerdedoraId === partida.equipeAId ? capitaoEquipeAId : equipePerdedoraId === partida.equipeBId ? capitaoEquipeBId : null;
  if (!capitaoPerdedor || capitaoPerdedor !== auth.user.id) {
    return NextResponse.json({ error: "Apenas o capitão da dupla adversária pode confirmar este placar" }, { status: 403 });
  }

  const config = await categoriaConfigService.obterOuDefault(partida.categoriaId);
  const regras = obterRegrasPartidaEfetivas({
    regrasBase: config.regrasPartida,
    regrasPorFase: config.regrasPartidaPorFase ?? null,
    fase: partida.fase,
    superCampeonato: partida.superCampeonato,
    superCampeonatoFormato: partida.superCampeonatoFormato,
  });

  const resultado = calcularResultadoPartida({
    regras,
    equipeAId: partida.equipeAId,
    equipeBId: partida.equipeBId,
    detalhesPlacar: pendente.detalhesPlacar as any,
  });

  if (!resultado.vencedorId) return NextResponse.json({ error: "O placar informado não define um vencedor válido" }, { status: 400 });
  if (resultado.vencedorId !== pendente.vencedorId) {
    return NextResponse.json({ error: "O placar pendente ficou inconsistente. Peça para o capitão reenviar." }, { status: 409 });
  }

  const [updated] = await db.transaction(async (tx) => {
    const [pUpdated] = await tx
      .update(partidas)
      .set({
        detalhesPlacar: resultado.detalhesPlacar as any,
        placarA: resultado.placarA,
        placarB: resultado.placarB,
        vencedorId: resultado.vencedorId,
        status: "FINALIZADA",
        finalizadoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(partidas.id, partidaId))
      .returning();

    await tx
      .update(placarSubmissoes)
      .set({
        status: "CONFIRMADA",
        confirmadoEm: new Date(),
        confirmadoPorUsuarioId: auth.user.id,
        atualizadoEm: new Date(),
      })
      .where(eq(placarSubmissoes.id, pendente.id));

    return [pUpdated] as const;
  });

  if (partida.fase === "GRUPOS") {
    await classificacaoCategoriaService.recalcularPorCategoria(partida.categoriaId).catch(() => null);
  } else {
    const mataMataService = new MataMataService();
    await mataMataService
      .sincronizarChaveAposAtualizacaoResultado({
        torneioId: partida.torneioId,
        categoriaId: partida.categoriaId,
        faseAtual: partida.fase as any,
      })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true, partida: updated }, { headers: { "Cache-Control": "no-store" } });
}

