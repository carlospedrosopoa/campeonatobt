import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { partidas, placarSubmissoes, torneios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sha256Hex } from "@/lib/token";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { calcularResultadoSets } from "@/lib/regras-partida";
import { MataMataService } from "@/services/mata-mata.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as any;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const acao = typeof body?.acao === "string" ? body.acao.trim().toUpperCase() : "";
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : null;

  if (!token) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });
  if (acao !== "CONFIRMAR" && acao !== "CANCELAR") return NextResponse.json({ error: "Ação inválida" }, { status: 400 });

  const tokenHash = sha256Hex(token);
  const rows = await db
    .select({
      id: placarSubmissoes.id,
      partidaId: placarSubmissoes.partidaId,
      usuarioId: placarSubmissoes.usuarioId,
      status: placarSubmissoes.status,
      detalhesPlacar: placarSubmissoes.detalhesPlacar,
      tokenHash: placarSubmissoes.tokenHash,
      tokenExpiraEm: placarSubmissoes.tokenExpiraEm,
    })
    .from(placarSubmissoes)
    .where(eq(placarSubmissoes.id, id))
    .limit(1);

  const sub = rows[0];
  if (!sub) return NextResponse.json({ error: "Submissão não encontrada" }, { status: 404 });
  if (sub.tokenHash !== tokenHash) return NextResponse.json({ error: "Token inválido" }, { status: 403 });
  if (sub.status !== "PENDENTE") return NextResponse.json({ error: "Submissão já processada" }, { status: 409 });
  if (sub.tokenExpiraEm && new Date(sub.tokenExpiraEm).getTime() < Date.now()) {
    return NextResponse.json({ error: "Token expirado" }, { status: 403 });
  }

  if (acao === "CANCELAR") {
    const [updated] = await db
      .update(placarSubmissoes)
      .set({
        status: "CANCELADA",
        canceladoEm: new Date(),
        canceladoMotivo: motivo,
        atualizadoEm: new Date(),
      })
      .where(and(eq(placarSubmissoes.id, id), eq(placarSubmissoes.status, "PENDENTE")))
      .returning();
    return NextResponse.json({ ok: true, submissao: updated }, { headers: { "Cache-Control": "no-store" } });
  }

  const partidaRows = await db
    .select({
      id: partidas.id,
      torneioId: partidas.torneioId,
      categoriaId: partidas.categoriaId,
      fase: partidas.fase,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
      superCampeonato: torneios.superCampeonato,
    })
    .from(partidas)
    .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
    .where(eq(partidas.id, sub.partidaId))
    .limit(1);
  const partida = partidaRows[0];
  if (!partida) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

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
    detalhesPlacar: sub.detalhesPlacar,
  });

  const [updatedPartida] = await db
    .update(partidas)
    .set({
      detalhesPlacar: resultado.detalhesPlacar as any,
      placarA: resultado.placarA,
      placarB: resultado.placarB,
      vencedorId: resultado.vencedorId,
      status: "FINALIZADA",
      atualizadoEm: new Date(),
    })
    .where(eq(partidas.id, partida.id))
    .returning();

  const [updatedSub] = await db
    .update(placarSubmissoes)
    .set({
      status: "CONFIRMADA",
      confirmadoEm: new Date(),
      atualizadoEm: new Date(),
      placarA: resultado.placarA,
      placarB: resultado.placarB,
      vencedorId: resultado.vencedorId,
      detalhesPlacar: resultado.detalhesPlacar as any,
    })
    .where(eq(placarSubmissoes.id, id))
    .returning();

  let proximaFaseCriada: string | null = null;
  let partidasCriadas = 0;
  let proximaFaseAtualizada: string | null = null;
  let partidasAtualizadas = 0;
  if (partida.fase !== "GRUPOS") {
    const mataMataService = new MataMataService();
    const r = await mataMataService.sincronizarChaveAposAtualizacaoResultado({
      torneioId: partida.torneioId,
      categoriaId: partida.categoriaId,
      faseAtual: partida.fase as any,
    });
    proximaFaseCriada = r.faseCriada ?? null;
    partidasCriadas = r.partidasCriadas ?? 0;
    proximaFaseAtualizada = r.faseAtualizada ?? null;
    partidasAtualizadas = r.partidasAtualizadas ?? 0;
  }

  return NextResponse.json(
    { ok: true, partida: updatedPartida, submissao: updatedSub, proximaFaseCriada, partidasCriadas, proximaFaseAtualizada, partidasAtualizadas },
    { headers: { "Cache-Control": "no-store" } }
  );
}
