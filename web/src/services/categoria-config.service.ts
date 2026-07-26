import { db } from "@/db";
import { categoriaConfiguracoes, categorias, esportes, torneios } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_REGRAS_PARTIDA_BT,
  DEFAULT_REGRAS_PARTIDA_VOLEI,
  type RegrasPartidaBTSets,
  type RegrasPartidaConfig,
  type RegrasPartidaVoleiSets,
} from "@/lib/regras-partida";

export type CategoriaFormato = "GRUPOS" | "MATA_MATA" | "LIGA";
export type CategoriaTipoParticipacao = "DUPLAS" | "SIMPLES";

export type MataMataEstrutura =
  | "PADRAO"
  | "SUPER_CAMPEONATO_6"
  | "GRUPOS_6_MELHORES_PRIMEIROS_BYE"
  | "GRUPOS_8_CRUZAMENTO_PADRAO";

export type CategoriaConfigV1 = {
  versao: 1;
  formato: CategoriaFormato;
  tipoParticipacao?: CategoriaTipoParticipacao;
  grupos?: {
    modo: "AUTO" | "MANUAL";
    tamanhoAlvo: number;
    quantidade?: number;
  };
  classificacao?: {
    porGrupo: number;
    melhoresTerceiros?: number;
  };
  fase2?: {
    habilitada: boolean;
    temFinal: boolean;
    disputaTerceiroLugar?: boolean;
  };
  mataMata?: {
    estrutura: MataMataEstrutura;
    quantidadeClassificados?: number;
  };
  regrasPartida?: RegrasPartidaConfig;
  desempate?: ("PONTOS" | "CONFRONTO_DIRETO" | "SALDO_GAMES" | "GAMES_PRO" | "VITORIAS" | "SORTEIO")[];
};

export const defaultCategoriaConfigV1: CategoriaConfigV1 = {
  versao: 1,
  formato: "GRUPOS",
  tipoParticipacao: "DUPLAS",
  grupos: { modo: "AUTO", tamanhoAlvo: 4 },
  classificacao: { porGrupo: 2 },
  fase2: { habilitada: true, temFinal: true, disputaTerceiroLugar: false },
  mataMata: { estrutura: "SUPER_CAMPEONATO_6" },
  regrasPartida: { ...DEFAULT_REGRAS_PARTIDA_BT },
  desempate: ["VITORIAS", "SALDO_GAMES", "CONFRONTO_DIRETO", "GAMES_PRO", "SORTEIO"],
};

function isEsporteVolei(esporte?: { slug?: string | null; nome?: string | null } | null) {
  const normalizado = `${esporte?.slug ?? ""} ${esporte?.nome ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalizado.includes("volei") || normalizado.includes("volleyball");
}

function criarConfigPadrao(esporte?: { slug?: string | null; nome?: string | null } | null): CategoriaConfigV1 {
  return {
    ...defaultCategoriaConfigV1,
    grupos: defaultCategoriaConfigV1.grupos ? { ...defaultCategoriaConfigV1.grupos } : undefined,
    classificacao: defaultCategoriaConfigV1.classificacao ? { ...defaultCategoriaConfigV1.classificacao } : undefined,
    fase2: defaultCategoriaConfigV1.fase2 ? { ...defaultCategoriaConfigV1.fase2 } : undefined,
    mataMata: defaultCategoriaConfigV1.mataMata ? { ...defaultCategoriaConfigV1.mataMata } : undefined,
    regrasPartida: isEsporteVolei(esporte) ? { ...DEFAULT_REGRAS_PARTIDA_VOLEI } : { ...DEFAULT_REGRAS_PARTIDA_BT },
    desempate: [...(defaultCategoriaConfigV1.desempate ?? [])],
  };
}

function normalizeConfig(input: any): CategoriaConfigV1 {
  const versao = 1;
  const formato: CategoriaFormato = input?.formato === "MATA_MATA" || input?.formato === "LIGA" ? input.formato : "GRUPOS";
  const tipoParticipacao: CategoriaTipoParticipacao = input?.tipoParticipacao === "SIMPLES" ? "SIMPLES" : "DUPLAS";

  const tamanhoAlvo =
    typeof input?.grupos?.tamanhoAlvo === "number" && Number.isFinite(input.grupos.tamanhoAlvo) && input.grupos.tamanhoAlvo > 1
      ? Math.floor(input.grupos.tamanhoAlvo)
      : 4;
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
  const disputaTerceiroLugar = input?.fase2?.disputaTerceiroLugar === true;

  // Normaliza configurações de mata-mata
  const estrutura: MataMataEstrutura =
    input?.mataMata?.estrutura === "PADRAO"
      ? "PADRAO"
      : input?.mataMata?.estrutura === "GRUPOS_6_MELHORES_PRIMEIROS_BYE"
        ? "GRUPOS_6_MELHORES_PRIMEIROS_BYE"
        : input?.mataMata?.estrutura === "GRUPOS_8_CRUZAMENTO_PADRAO"
          ? "GRUPOS_8_CRUZAMENTO_PADRAO"
        : "SUPER_CAMPEONATO_6";
  const quantidadeClassificados =
    typeof input?.mataMata?.quantidadeClassificados === "number" && input.mataMata.quantidadeClassificados > 0
      ? Math.floor(input.mataMata.quantidadeClassificados)
      : undefined;

  const regrasInput = input?.regrasPartida;
  const regrasPartida: RegrasPartidaConfig = (() => {
    if (regrasInput?.tipo === "VOLEI_SETS") {
      const melhorDe: 3 | 5 = regrasInput?.melhorDe === 5 ? 5 : 3;
      const pontosPorSet: 21 | 25 = regrasInput?.pontosPorSet === 21 ? 21 : 25;
      const tieBreakHabilitado = regrasInput?.tieBreakDecisivo?.habilitado !== false;
      const tieBreakAte: 15 = 15;
      const tieBreakDiff: 2 = 2;
      const diffMin: 2 = 2;
      const normalizado: RegrasPartidaVoleiSets = {
        tipo: "VOLEI_SETS",
        melhorDe,
        pontosPorSet,
        tieBreakDecisivo: {
          habilitado: tieBreakHabilitado,
          ate: tieBreakAte,
          diffMin: tieBreakDiff,
        },
        diffMin,
      };
      return normalizado;
    }

    const melhorDe: 1 | 3 = regrasInput?.melhorDe === 3 ? 3 : 1;
    const gamesPorSet: 4 | 5 | 6 =
      regrasInput?.gamesPorSet === 4 ? 4 : regrasInput?.gamesPorSet === 5 ? 5 : 6;
    const tbHabilitado = regrasInput?.tiebreak?.habilitado === false ? false : true;
    const tbEm = typeof regrasInput?.tiebreak?.em === "number" ? regrasInput.tiebreak.em : gamesPorSet;
    const tbAte = typeof regrasInput?.tiebreak?.ate === "number" ? regrasInput.tiebreak.ate : gamesPorSet + 1;
    const tbDiff = typeof regrasInput?.tiebreak?.diffMin === "number" ? regrasInput.tiebreak.diffMin : 2;
    const stHabilitado = regrasInput?.superTiebreakDecisivo?.habilitado === true;
    const stAte = typeof regrasInput?.superTiebreakDecisivo?.ate === "number" ? regrasInput.superTiebreakDecisivo.ate : 10;
    const stDiff = typeof regrasInput?.superTiebreakDecisivo?.diffMin === "number" ? regrasInput.superTiebreakDecisivo.diffMin : 2;
    const incluirSuperTieEmGames = regrasInput?.incluirSuperTieEmGames === true;

    const normalizado: RegrasPartidaBTSets = {
      tipo: "BT_SETS",
      melhorDe,
      gamesPorSet,
      tiebreak: { habilitado: tbHabilitado, em: tbEm, ate: tbAte, diffMin: tbDiff },
      superTiebreakDecisivo: { habilitado: melhorDe === 3 ? stHabilitado : false, ate: stAte, diffMin: stDiff },
      incluirSuperTieEmGames,
    };
    return normalizado;
  })();

  const desempateBase = Array.isArray(input?.desempate) ? input.desempate : defaultCategoriaConfigV1.desempate;
  const desempate = (desempateBase as any[]).filter(Boolean);

  return {
    versao,
    formato,
    tipoParticipacao,
    grupos: formato === "MATA_MATA" ? undefined : { modo, tamanhoAlvo, quantidade: modo === "MANUAL" ? quantidade : undefined },
    classificacao: formato === "GRUPOS" ? { porGrupo, melhoresTerceiros } : undefined,
    fase2: formato === "GRUPOS" ? { habilitada: fase2Habilitada, temFinal, disputaTerceiroLugar } : undefined,
    mataMata: { estrutura, quantidadeClassificados },
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
    if (!row) {
      const categoriaMeta = await db
        .select({
          esporteSlug: esportes.slug,
          esporteNome: esportes.nome,
        })
        .from(categorias)
        .innerJoin(torneios, eq(categorias.torneioId, torneios.id))
        .leftJoin(esportes, eq(torneios.esporteId, esportes.id))
        .where(eq(categorias.id, categoriaId))
        .limit(1);
      return criarConfigPadrao({
        slug: categoriaMeta[0]?.esporteSlug ?? null,
        nome: categoriaMeta[0]?.esporteNome ?? null,
      });
    }
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
