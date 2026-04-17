import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, partidas, placarSubmissoes, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { calcularResultadoSets } from "@/lib/regras-partida";
import { gerarTokenAleatorio, sha256Hex } from "@/lib/token";
import { enviarMensagemGzappy } from "@/services/gzappy.service";
import { gzappyConfigService } from "@/services/gzappy-config.service";
import { equipesDisplayService } from "@/services/equipes-display.service";

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

  const pendente = await db
    .select({ id: placarSubmissoes.id })
    .from(placarSubmissoes)
    .where(and(eq(placarSubmissoes.partidaId, partidaId), eq(placarSubmissoes.status, "PENDENTE")))
    .limit(1);
  if (pendente[0]) return NextResponse.json({ error: "Já existe um placar pendente de confirmação para esta partida" }, { status: 409 });

  const gzappy = await gzappyConfigService.obter();
  if (!gzappy.ativo || !gzappy.whatsappArbitragem) {
    return NextResponse.json({ error: "Arbitragem não configurada para confirmação via WhatsApp" }, { status: 400 });
  }

  const config = await categoriaConfigService.obterOuDefault(partida.categoriaId);
  const regrasBase = config.regrasPartida ?? {
    tipo: "SETS" as const,
    melhorDe: 1 as const,
    gamesPorSet: 6 as const,
    tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
    superTiebreakDecisivo: { habilitado: false, ate: 10, diffMin: 2 },
    incluirSuperTieEmGames: false,
  };

  const regras =
    partida.superCampeonato
      ? ({
          ...regrasBase,
          tipo: "SETS" as const,
          melhorDe: 3 as const,
          tiebreak: regrasBase.tiebreak ?? { habilitado: true, em: 6, ate: 7, diffMin: 2 },
          superTiebreakDecisivo: {
            habilitado: true,
            ate: regrasBase.superTiebreakDecisivo?.ate ?? 10,
            diffMin: regrasBase.superTiebreakDecisivo?.diffMin ?? 2,
          },
          incluirSuperTieEmGames: false,
        } as const)
      : regrasBase;

  const resultado = calcularResultadoSets({
    regras,
    equipeAId: partida.equipeAId,
    equipeBId: partida.equipeBId,
    detalhesPlacar,
  });

  const token = gerarTokenAleatorio(32);
  const tokenHash = sha256Hex(token);
  const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [submissao] = await db
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

  const origin = new URL(request.url).origin;
  const link = `${origin}/arbitragem/placar/${submissao.id}?token=${encodeURIComponent(token)}`;
  const nomesEquipes = await equipesDisplayService.mapNomesEquipes([partida.equipeAId, partida.equipeBId]);
  const equipeANome = nomesEquipes.get(partida.equipeAId) ?? "Equipe A";
  const equipeBNome = nomesEquipes.get(partida.equipeBId) ?? "Equipe B";

  const userInfo = await db
    .select({ nome: usuarios.nome, email: usuarios.email, telefone: usuarios.telefone })
    .from(usuarios)
    .where(eq(usuarios.id, auth.user.id))
    .limit(1);
  const informante = userInfo[0];

  const msg =
    `Placar informado para confirmação.\n\n` +
    `Torneio: ${partida.torneioNome}\n` +
    `Categoria: ${partida.categoriaNome}\n` +
    `Jogo: ${equipeANome} x ${equipeBNome}\n` +
    `Resultado: ${resultado.placarA} x ${resultado.placarB}\n` +
    `Detalhes: ${Array.isArray(resultado.detalhesPlacar) ? resultado.detalhesPlacar.map((s: any) => `${s.a}-${s.b}`).join(" ") : "-"}\n` +
    `Data/Hora: ${partida.dataHorario ? new Date(partida.dataHorario).toLocaleString("pt-BR") : "-"}\n` +
    `Quadra: ${partida.quadra || "-"}\n\n` +
    `Informado por: ${informante?.nome || auth.user.nome} (${informante?.email || auth.user.email})\n` +
    `Telefone: ${informante?.telefone || "-"}\n\n` +
    `Confirmar ou cancelar: ${link}`;

  const envio = await enviarMensagemGzappy({ destinatario: gzappy.whatsappArbitragem, mensagem: msg });

  return NextResponse.json(
    { ok: true, submissaoId: submissao.id, ...(envio.ok ? {} : { avisos: ["Falha ao notificar a arbitragem via WhatsApp"] }) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
