import { db } from "@/db";
import { categorias, equipeIntegrantes, partidas, placarSubmissoes, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";
import { MataMataService } from "@/services/mata-mata.service";
import { calcularResultadoPartida, obterRegrasPartidaEfetivas } from "@/lib/regras-partida";

/** Erro com status HTTP, para as rotas devolverem a mensagem certa. */
export class ErroPlacar extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type PlacarPendente = {
  id: string;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  placarA: number;
  placarB: number;
  vencedorId: string | null;
  informadoPor: { id: string; nome: string };
  /** dupla de quem informou: A ou B do jogo */
  informadoPeloLado: "A" | "B" | null;
  informadoEm: string;
};

export class PlacarSubmissoesService {
  /** Placares informados por atletas e ainda nao confirmados, por partida. */
  async pendentesPorPartidas(lista: { id: string; equipeAId: string; equipeBId: string }[]): Promise<Map<string, PlacarPendente>> {
    const mapa = new Map<string, PlacarPendente>();
    if (lista.length === 0) return mapa;
    const rows = await db
      .select({
        id: placarSubmissoes.id,
        partidaId: placarSubmissoes.partidaId,
        usuarioId: placarSubmissoes.usuarioId,
        usuarioNome: usuarios.nome,
        detalhesPlacar: placarSubmissoes.detalhesPlacar,
        placarA: placarSubmissoes.placarA,
        placarB: placarSubmissoes.placarB,
        vencedorId: placarSubmissoes.vencedorId,
        atualizadoEm: placarSubmissoes.atualizadoEm,
      })
      .from(placarSubmissoes)
      .innerJoin(usuarios, eq(usuarios.id, placarSubmissoes.usuarioId))
      .where(and(inArray(placarSubmissoes.partidaId, lista.map((p) => p.id)), eq(placarSubmissoes.status, "PENDENTE")));
    if (rows.length === 0) return mapa;

    const equipeIds = Array.from(new Set(lista.flatMap((p) => [p.equipeAId, p.equipeBId])));
    const membros = await db
      .select({ equipeId: equipeIntegrantes.equipeId, usuarioId: equipeIntegrantes.usuarioId })
      .from(equipeIntegrantes)
      .where(and(inArray(equipeIntegrantes.usuarioId, rows.map((r) => r.usuarioId)), inArray(equipeIntegrantes.equipeId, equipeIds)));

    for (const r of rows) {
      const p = lista.find((x) => x.id === r.partidaId);
      if (!p) continue;
      const equipe = membros.find((m) => m.usuarioId === r.usuarioId && (m.equipeId === p.equipeAId || m.equipeId === p.equipeBId))?.equipeId;
      mapa.set(r.partidaId, {
        id: r.id,
        detalhesPlacar: (r.detalhesPlacar as PlacarPendente["detalhesPlacar"]) ?? null,
        placarA: r.placarA,
        placarB: r.placarB,
        vencedorId: r.vencedorId ?? null,
        informadoPor: { id: r.usuarioId, nome: r.usuarioNome },
        informadoPeloLado: equipe === p.equipeAId ? "A" : equipe === p.equipeBId ? "B" : null,
        informadoEm: new Date(r.atualizadoEm).toISOString(),
      });
    }
    return mapa;
  }

  /**
   * Torna oficial o placar pendente: grava o resultado na partida, marca a submissao como confirmada,
   * recalcula a classificacao (grupos) ou avanca a chave (mata-mata). Quem pode confirmar e checado por quem chama.
   */
  async confirmarPendente(params: { partidaId: string; confirmadoPorUsuarioId: string }) {
    const [partida] = await db
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
      })
      .from(partidas)
      .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .where(eq(partidas.id, params.partidaId))
      .limit(1);
    if (!partida) throw new ErroPlacar("Partida não encontrada", 404);
    if (partida.status === "FINALIZADA" || partida.status === "WO") {
      throw new ErroPlacar("Este jogo já tem resultado oficial. Recuse o placar pendente.", 409);
    }

    const [pendente] = await db
      .select({ id: placarSubmissoes.id, detalhesPlacar: placarSubmissoes.detalhesPlacar, vencedorId: placarSubmissoes.vencedorId })
      .from(placarSubmissoes)
      .where(and(eq(placarSubmissoes.partidaId, params.partidaId), eq(placarSubmissoes.status, "PENDENTE")))
      .limit(1);
    if (!pendente) throw new ErroPlacar("Não existe placar pendente para confirmar", 404);

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
    if (!resultado.vencedorId) throw new ErroPlacar("O placar informado não define um vencedor válido", 400);
    if (resultado.vencedorId !== pendente.vencedorId) {
      throw new ErroPlacar("O placar pendente ficou inconsistente. Peça para informarem de novo.", 409);
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
        .where(eq(partidas.id, params.partidaId))
        .returning();
      await tx
        .update(placarSubmissoes)
        .set({ status: "CONFIRMADA", confirmadoEm: new Date(), confirmadoPorUsuarioId: params.confirmadoPorUsuarioId, atualizadoEm: new Date() })
        .where(eq(placarSubmissoes.id, pendente.id));
      return [pUpdated] as const;
    });

    if (partida.fase === "GRUPOS") {
      await classificacaoCategoriaService.recalcularPorCategoria(partida.categoriaId).catch(() => null);
      await new MataMataService()
        .liberarJogosProntos({ torneioId: partida.torneioId, categoriaId: partida.categoriaId })
        .catch((e) => console.error("[mata-mata] falha ao liberar jogos prontos", e));
    } else {
      await new MataMataService()
        .sincronizarChaveAposAtualizacaoResultado({ torneioId: partida.torneioId, categoriaId: partida.categoriaId, faseAtual: partida.fase as any })
        .catch(() => null);
    }
    return updated;
  }

  /** Descarta o placar pendente; a partida continua sem resultado. */
  async recusarPendente(params: { partidaId: string; motivo: string }) {
    const [pendente] = await db
      .select({ id: placarSubmissoes.id })
      .from(placarSubmissoes)
      .where(and(eq(placarSubmissoes.partidaId, params.partidaId), eq(placarSubmissoes.status, "PENDENTE")))
      .limit(1);
    if (!pendente) throw new ErroPlacar("Não existe placar pendente para recusar", 404);
    await db
      .update(placarSubmissoes)
      .set({ status: "CANCELADA", canceladoEm: new Date(), canceladoMotivo: params.motivo, atualizadoEm: new Date() })
      .where(eq(placarSubmissoes.id, pendente.id));
  }
}

export const placarSubmissoesService = new PlacarSubmissoesService();
