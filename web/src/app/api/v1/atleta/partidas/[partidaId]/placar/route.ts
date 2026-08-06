import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, partidas, placarSubmissoes, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { calcularResultadoPartida, obterRegrasPartidaEfetivas } from "@/lib/regras-partida";
import { gerarTokenAleatorio, sha256Hex } from "@/lib/token";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ partidaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { partidaId } = await params;
  const body = (await request.json().catch(() => null)) as any;
  const detalhesPlacar = Array.isArray(body?.detalhesPlacar) ? body.detalhesPlacar : null;
  if (!detalhesPlacar) return NextResponse.json({ error: "detalhesPlacar é obrigatório" }, { status: 400 });

  const partidaRows = await db
    .select({
      id: partidas.id,
      torneioId: partidas.torneioId,
      categoriaId: partidas.categoriaId,
      fase: partidas.fase,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
      status: partidas.status,
      dataHorario: partidas.dataHorario,
      quadra: partidas.quadra,
      torneioNome: torneios.nome,
      torneioSlug: torneios.slug,
      superCampeonato: torneios.superCampeonato,
      superCampeonatoFormato: torneios.superCampeonatoFormato,
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
  const isCapitaoA = capitaoEquipeAId === auth.user.id;
  const isCapitaoB = capitaoEquipeBId === auth.user.id;
  if (!isCapitaoA && !isCapitaoB) {
    return NextResponse.json({ error: "Apenas o capitão da dupla pode informar/alterar placar" }, { status: 403 });
  }

  const [pendenteAtual] = await db
    .select({
      id: placarSubmissoes.id,
      usuarioId: placarSubmissoes.usuarioId,
    })
    .from(placarSubmissoes)
    .where(and(eq(placarSubmissoes.partidaId, partidaId), eq(placarSubmissoes.status, "PENDENTE")))
    .limit(1);

  if (detalhesPlacar.length === 0) {
    if (pendenteAtual?.id && pendenteAtual.usuarioId === auth.user.id) {
      await db
        .update(placarSubmissoes)
        .set({
          status: "CANCELADA",
          canceladoEm: new Date(),
          canceladoMotivo: "Zerado pelo capitão da dupla vencedora",
          atualizadoEm: new Date(),
        })
        .where(eq(placarSubmissoes.id, pendenteAtual.id));
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  if (pendenteAtual?.id && pendenteAtual.usuarioId !== auth.user.id) {
    return NextResponse.json({ error: "Já existe um placar pendente informado pelo outro capitão" }, { status: 409 });
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
    detalhesPlacar,
  });

  const capitaoVencedor =
    resultado.vencedorId === partida.equipeAId ? capitaoEquipeAId : resultado.vencedorId === partida.equipeBId ? capitaoEquipeBId : null;
  if (!capitaoVencedor || capitaoVencedor !== auth.user.id) {
    return NextResponse.json({ error: "Somente o capitão da dupla vencedora pode informar o placar" }, { status: 403 });
  }

  const tokenHash = sha256Hex(gerarTokenAleatorio(32));
  const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const upsert = pendenteAtual?.id
    ? await db
        .update(placarSubmissoes)
        .set({
          usuarioId: auth.user.id,
          status: "PENDENTE",
          detalhesPlacar: resultado.detalhesPlacar as any,
          placarA: resultado.placarA,
          placarB: resultado.placarB,
          vencedorId: resultado.vencedorId,
          tokenHash,
          tokenExpiraEm: expira,
          confirmadoEm: null,
          confirmadoPorUsuarioId: null,
          canceladoEm: null,
          canceladoMotivo: null,
          atualizadoEm: new Date(),
        })
        .where(eq(placarSubmissoes.id, pendenteAtual.id))
        .returning()
    : await db
        .insert(placarSubmissoes)
        .values({
          partidaId: partida.id,
          usuarioId: auth.user.id,
          status: "PENDENTE",
          detalhesPlacar: resultado.detalhesPlacar as any,
          placarA: resultado.placarA,
          placarB: resultado.placarB,
          vencedorId: resultado.vencedorId,
          tokenHash,
          tokenExpiraEm: expira,
          atualizadoEm: new Date(),
        })
        .returning();
  const submissao = upsert[0];

  return NextResponse.json(
    { ok: true, submissaoId: submissao.id, status: "PENDENTE" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
