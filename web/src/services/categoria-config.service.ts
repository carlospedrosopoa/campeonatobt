import { db } from "@/db";
import { categoriaConfiguracoes } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CategoriaFormato = "GRUPOS" | "MATA_MATA" | "LIGA";

export type RegrasPartidaSets = {
  tipo: "SETS";
  melhorDe: 1 | 3;
  gamesPorSet: 4 | 6;
  tiebreak: { habilitado: boolean; em: number; ate: number; diffMin: number };
  superTiebreakDecisivo?: { habilitado: boolean; ate: number; diffMin: number };
  incluirSuperTieEmGames?: boolean;
};

export type CategoriaConfigV1 = {
  versao: 1;
  formato: CategoriaFormato;
  grupos?: {
    modo: "AUTO" | "MANUAL";
    tamanhoAlvo: 3 | 4;
    quantidade?: number;
  };
  classificacao?: {
    porGrupo: number;
    melhoresTerceiros?: number;
  };
  fase2?: {
    habilitada: boolean;
    temFinal: boolean;
  };
  regrasPartida?: RegrasPartidaSets;
  desempate?: ("PONTOS" | "CONFRONTO_DIRETO" | "SALDO_GAMES" | "GAMES_PRO" | "VITORIAS" | "SORTEIO")[];
};

export const defaultCategoriaConfigV1: CategoriaConfigV1 = {
  versao: 1,
  formato: "GRUPOS",
  grupos: { modo: "AUTO", tamanhoAlvo: 4 },
  classificacao: { porGrupo: 2 },
  fase2: { habilitada: true, temFinal: true },
  regrasPartida: {
    tipo: "SETS",
    melhorDe: 1,
    gamesPorSet: 6,
    tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
    superTiebreakDecisivo: { habilitado: false, ate: 10, diffMin: 2 },
    incluirSuperTieEmGames: false,
  },
  desempate: ["PONTOS", "CONFRONTO_DIRETO", "SALDO_GAMES", "GAMES_PRO", "VITORIAS", "SORTEIO"],
};

function normalizeConfig(input: any): CategoriaConfigV1 {
  const versao = 1;
  const formato: CategoriaFormato = input?.formato === "MATA_MATA" || input?.formato === "LIGA" ? input.formato : "GRUPOS";

  const tamanhoAlvo = input?.grupos?.tamanhoAlvo === 3 ? 3 : 4;
  const modo = input?.grupos?.modo === "MANUAL" ? "MANUAL" : "AUTO";
  const quantidade = typeof input?.grupos?.quantidade === "number" && input.grupos.quantidade > 0 ? input.grupos.quantidade : undefined;

  const porGrupo =
    typeof input?.classificacao?.porGrupo === "number" && input.classificacao.porGrupo > 0
      ? Math.floor(input.classificacao.porGrupo)
      : 2;

  const melhoresTerceiros =
    typeof input?.classificacao?.melhoresTerceiros === "number" && input.classificacao.melhoresTerceiros > 0
      ? Math.floor(input.classificacao.melhoresTerceiros)
      : undefined;

  const fase2Habilitada = input?.fase2?.habilitada === false ? false : true;
  const temFinal = input?.fase2?.temFinal === false ? false : true;

  const tipo = input?.regrasPartida?.tipo === "SETS" ? "SETS" : "SETS";
  const melhorDe: 1 | 3 = input?.regrasPartida?.melhorDe === 3 ? 3 : 1;
  const gamesPorSet: 4 | 6 = input?.regrasPartida?.gamesPorSet === 4 ? 4 : 6;
  const tbHabilitado = input?.regrasPartida?.tiebreak?.habilitado === false ? false : true;
  const tbEm = typeof input?.regrasPartida?.tiebreak?.em === "number" ? input.regrasPartida.tiebreak.em : gamesPorSet;
  const tbAte = typeof input?.regrasPartida?.tiebreak?.ate === "number" ? input.regrasPartida.tiebreak.ate : gamesPorSet + 1;
  const tbDiff = typeof input?.regrasPartida?.tiebreak?.diffMin === "number" ? input.regrasPartida.tiebreak.diffMin : 2;
  const stHabilitado = input?.regrasPartida?.superTiebreakDecisivo?.habilitado === true;
  const stAte = typeof input?.regrasPartida?.superTiebreakDecisivo?.ate === "number" ? input.regrasPartida.superTiebreakDecisivo.ate : 10;
  const stDiff = typeof input?.regrasPartida?.superTiebreakDecisivo?.diffMin === "number" ? input.regrasPartida.superTiebreakDecisivo.diffMin : 2;
  const incluirSuperTieEmGames = input?.regrasPartida?.incluirSuperTieEmGames === true;

  const regrasPartida: RegrasPartidaSets = {
    tipo,
    melhorDe,
    gamesPorSet,
    tiebreak: { habilitado: tbHabilitado, em: tbEm, ate: tbAte, diffMin: tbDiff },
    superTiebreakDecisivo: { habilitado: melhorDe === 3 ? stHabilitado : false, ate: stAte, diffMin: stDiff },
    incluirSuperTieEmGames,
  };

  const desempateBase = Array.isArray(input?.desempate) ? input.desempate : defaultCategoriaConfigV1.desempate;
  const desempate = (desempateBase as any[]).filter(Boolean);

  return {
    versao,
    formato,
    grupos: formato === "MATA_MATA" ? undefined : { modo, tamanhoAlvo, quantidade: modo === "MANUAL" ? quantidade : undefined },
    classificacao: formato === "GRUPOS" ? { porGrupo, melhoresTerceiros } : undefined,
    fase2: formato === "GRUPOS" ? { habilitada: fase2Habilitada, temFinal } : undefined,
    regrasPartida,
    desempate,
  };
}

export class CategoriaConfigService {
  async obterOuDefault(categoriaId: string) {
    const resultado = await db
      .select({ id: categoriaConfiguracoes.id, versao: categoriaConfiguracoes.versao, config: categoriaConfiguracoes.config })
      .from(categoriaConfiguracoes)
      .where(eq(categoriaConfiguracoes.categoriaId, categoriaId))
      .limit(1);

    const row = resultado[0];
    if (!row) return defaultCategoriaConfigV1;
    return normalizeConfig({ ...row.config, versao: row.versao });
  }

  async salvar(categoriaId: string, config: CategoriaConfigV1) {
    const normalized = normalizeConfig(config);
    const existente = await db
      .select({ id: categoriaConfiguracoes.id })
      .from(categoriaConfiguracoes)
      .where(eq(categoriaConfiguracoes.categoriaId, categoriaId))
      .limit(1);

    if (existente[0]) {
      const [updated] = await db
        .update(categoriaConfiguracoes)
        .set({ versao: normalized.versao, config: normalized as any, atualizadoEm: new Date() })
        .where(eq(categoriaConfiguracoes.categoriaId, categoriaId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(categoriaConfiguracoes)
      .values({ categoriaId, versao: normalized.versao, config: normalized as any })
      .returning();
    return created;
  }
}

export const categoriaConfigService = new CategoriaConfigService();
