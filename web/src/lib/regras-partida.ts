export type TieBreakConfig = {
  habilitado: boolean;
  em: number;
  ate: number;
  diffMin: number;
};

export type SuperTieConfig = {
  habilitado: boolean;
  ate: number;
  diffMin: number;
};

export type RegrasPartidaBTSets = {
  tipo: "BT_SETS";
  melhorDe: 1 | 3;
  gamesPorSet: 4 | 5 | 6;
  tiebreak: TieBreakConfig;
  superTiebreakDecisivo?: SuperTieConfig;
  incluirSuperTieEmGames?: boolean;
};

export type RegrasPartidaSets = {
  tipo: "SETS";
  melhorDe: 1 | 3;
  gamesPorSet: 4 | 5 | 6;
  tiebreak: TieBreakConfig;
  superTiebreakDecisivo?: SuperTieConfig;
  incluirSuperTieEmGames?: boolean;
};

export type RegrasPartidaVoleiSets = {
  tipo: "VOLEI_SETS";
  melhorDe: 3 | 5;
  pontosPorSet: 21 | 25;
  tieBreakDecisivo?: { habilitado: boolean; ate: 15; diffMin: 2 };
  diffMin: 2;
};

export type RegrasPartidaConfig = RegrasPartidaBTSets | RegrasPartidaVoleiSets;
export type SuperCampeonatoFormato = "2_SET_SUPER_TIE" | "1_SET";

export type FasePartida =
  | "GRUPOS"
  | "OITAVAS"
  | "QUARTAS"
  | "SEMI"
  | "FINAL"
  | "TERCEIRO_LUGAR"
  | "LIGA"
  | "MATA_MATA";

export type SetScore = { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number };

export const DEFAULT_REGRAS_PARTIDA_BT: RegrasPartidaBTSets = {
  tipo: "BT_SETS",
  melhorDe: 1,
  gamesPorSet: 6,
  tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
  superTiebreakDecisivo: { habilitado: false, ate: 10, diffMin: 2 },
  incluirSuperTieEmGames: false,
};

export const DEFAULT_REGRAS_PARTIDA_VOLEI: RegrasPartidaVoleiSets = {
  tipo: "VOLEI_SETS",
  melhorDe: 3,
  pontosPorSet: 21,
  tieBreakDecisivo: { habilitado: true, ate: 15, diffMin: 2 },
  diffMin: 2,
};

export type ResultadoPartidaCalculado = {
  placarA: number;
  placarB: number;
  vencedorId: string;
  detalhesPlacar: SetScore[];
};

function normalizarDetalhesPlacar(detalhesPlacar: SetScore[]) {
  return (Array.isArray(detalhesPlacar) ? detalhesPlacar : [])
    .map((s, idx) => ({
      set: idx + 1,
      a: Number(s?.a) || 0,
      b: Number(s?.b) || 0,
      tiebreak: Boolean(s?.tiebreak),
      tbA: (s as any)?.tbA === undefined || (s as any)?.tbA === null || (s as any)?.tbA === "" ? undefined : Number((s as any)?.tbA),
      tbB: (s as any)?.tbB === undefined || (s as any)?.tbB === null || (s as any)?.tbB === "" ? undefined : Number((s as any)?.tbB),
    }))
    .filter(
      (s) =>
        Number.isFinite(s.a) &&
        Number.isFinite(s.b) &&
        s.a >= 0 &&
        s.b >= 0 &&
        (s.tbA === undefined || (Number.isFinite(s.tbA) && s.tbA >= 0)) &&
        (s.tbB === undefined || (Number.isFinite(s.tbB) && s.tbB >= 0))
    );
}

export function isRegrasBeachTennisSets(
  regras: RegrasPartidaConfig | RegrasPartidaSets | null | undefined
): regras is RegrasPartidaBTSets | RegrasPartidaSets {
  return Boolean(regras && (regras.tipo === "BT_SETS" || regras.tipo === "SETS"));
}

export function isRegrasVoleiSets(regras: RegrasPartidaConfig | RegrasPartidaSets | null | undefined): regras is RegrasPartidaVoleiSets {
  return Boolean(regras && regras.tipo === "VOLEI_SETS");
}

export function normalizarRegrasBeachTennis(regras: RegrasPartidaBTSets | RegrasPartidaSets): RegrasPartidaBTSets {
  return {
    ...regras,
    tipo: "BT_SETS",
  };
}

export type RegrasPartidaPorFase = Partial<Record<FasePartida, RegrasPartidaConfig | RegrasPartidaSets | null>>;

function obterFaseCanonica(fase?: FasePartida | string | null): FasePartida | null {
  const normalized = String(fase || "").trim().toUpperCase();
  if (!normalized) return null;
  switch (normalized) {
    case "GRUPOS":
    case "OITAVAS":
    case "QUARTAS":
    case "SEMI":
    case "FINAL":
    case "TERCEIRO_LUGAR":
    case "LIGA":
    case "MATA_MATA":
      return normalized as FasePartida;
    default:
      return null;
  }
}

function obterRegrasPorFase(params: {
  regrasBase?: RegrasPartidaConfig | RegrasPartidaSets | null;
  regrasPorFase?: RegrasPartidaPorFase | null;
  fase?: FasePartida | string | null;
}) {
  const base = params.regrasBase ?? DEFAULT_REGRAS_PARTIDA_BT;
  if (!params.regrasPorFase) return base;

  const faseCanonica = obterFaseCanonica(params.fase);
  if (faseCanonica) {
    const porFase = params.regrasPorFase[faseCanonica];
    if (porFase) return porFase;
  }

  if (faseCanonica && (faseCanonica === "OITAVAS" || faseCanonica === "QUARTAS" || faseCanonica === "SEMI" || faseCanonica === "FINAL" || faseCanonica === "TERCEIRO_LUGAR" || faseCanonica === "MATA_MATA")) {
    const porFase = params.regrasPorFase.MATA_MATA;
    if (porFase) return porFase;
  }

  if (faseCanonica && faseCanonica === "GRUPOS") {
    const porFase = params.regrasPorFase.GRUPOS;
    if (porFase) return porFase;
  }

  if (faseCanonica && faseCanonica === "LIGA") {
    const porFase = params.regrasPorFase.LIGA;
    if (porFase) return porFase;
  }

  return base;
}

export function obterRegrasPartidaEfetivas(params: {
  regrasBase?: RegrasPartidaConfig | RegrasPartidaSets | null;
  regrasPorFase?: RegrasPartidaPorFase | null;
  fase?: FasePartida | string | null;
  superCampeonato?: boolean | null;
  superCampeonatoFormato?: SuperCampeonatoFormato | null;
}): RegrasPartidaConfig | RegrasPartidaSets {
  const regrasBase = obterRegrasPorFase({
    regrasBase: params.regrasBase ?? DEFAULT_REGRAS_PARTIDA_BT,
    regrasPorFase: params.regrasPorFase ?? null,
    fase: params.fase ?? null,
  });

  if (!params.superCampeonato) {
    return regrasBase;
  }

  if (!isRegrasBeachTennisSets(regrasBase)) {
    return regrasBase;
  }

  const regras = normalizarRegrasBeachTennis(regrasBase);
  const formatoSuperCampeonato = params.superCampeonatoFormato ?? "2_SET_SUPER_TIE";

  if (formatoSuperCampeonato === "1_SET") {
    return {
      ...regras,
      tipo: "BT_SETS",
      melhorDe: 1,
      superTiebreakDecisivo: {
        habilitado: false,
        ate: regras.superTiebreakDecisivo?.ate ?? 10,
        diffMin: regras.superTiebreakDecisivo?.diffMin ?? 2,
      },
    };
  }

  return {
    ...regras,
    tipo: "BT_SETS",
    melhorDe: 3,
    tiebreak: regras.tiebreak ?? { habilitado: true, em: 6, ate: 7, diffMin: 2 },
    superTiebreakDecisivo: {
      habilitado: true,
      ate: regras.superTiebreakDecisivo?.ate ?? 10,
      diffMin: regras.superTiebreakDecisivo?.diffMin ?? 2,
    },
    incluirSuperTieEmGames: false,
  };
}

export function obterIgnoreSuperTieMin(params: {
  regras?: RegrasPartidaConfig | RegrasPartidaSets | null;
  superCampeonato?: boolean | null;
  superCampeonatoFormato?: SuperCampeonatoFormato | null;
}): number | null {
  if (!isRegrasBeachTennisSets(params.regras)) {
    return null;
  }

  const regras = normalizarRegrasBeachTennis(params.regras);
  if (params.superCampeonato) {
    if ((params.superCampeonatoFormato ?? "2_SET_SUPER_TIE") === "1_SET") {
      return null;
    }
    return regras.superTiebreakDecisivo?.ate ?? 10;
  }

  return regras.superTiebreakDecisivo?.habilitado && regras.incluirSuperTieEmGames !== true
    ? regras.superTiebreakDecisivo.ate ?? 10
    : null;
}

export function calcularResultadoBeachTennisSets(params: {
  regras: RegrasPartidaBTSets | RegrasPartidaSets;
  equipeAId: string;
  equipeBId: string;
  detalhesPlacar: SetScore[];
}): ResultadoPartidaCalculado {
  const regras = normalizarRegrasBeachTennis(params.regras);
  const detalhes = normalizarDetalhesPlacar(params.detalhesPlacar);

  const setsNeeded = regras.melhorDe === 1 ? 1 : 2;
  const maxSets = regras.melhorDe === 1 ? 1 : 3;

  if (detalhes.length === 0) throw new Error("Informe o placar por set");
  if (detalhes.length > maxSets) throw new Error("Quantidade de sets inválida para a regra de jogo");

  let setsA = 0;
  let setsB = 0;

  const normalized: SetScore[] = [];

  for (let i = 0; i < detalhes.length; i++) {
    const s = detalhes[i];
    const setIndex = i + 1;

    const isSuperTie =
      regras.melhorDe === 3 &&
      setIndex === 3 &&
      (regras.superTiebreakDecisivo?.habilitado ?? false);

    if (isSuperTie) {
      const ate = regras.superTiebreakDecisivo?.ate ?? 10;
      const diffMin = regras.superTiebreakDecisivo?.diffMin ?? 2;
      const winner = Math.max(s.a, s.b);
      const loser = Math.min(s.a, s.b);
      if (winner < ate) throw new Error("Super tie precisa atingir a pontuação mínima");
      if (winner - loser < diffMin) throw new Error("Super tie precisa ter diferença mínima");
      if (s.a === s.b) throw new Error("Super tie não pode terminar empatado");
      if (s.a > s.b) setsA += 1;
      else setsB += 1;
      normalized.push({ set: setIndex, a: s.a, b: s.b, tiebreak: true });
    } else {
      const games = regras.gamesPorSet;
      const tb = regras.tiebreak;

      const isTieAtTb =
        tb.habilitado &&
        ((s.a === tb.em && s.b === tb.em) || (Math.max(s.a, s.b) === tb.em + 1 && Math.min(s.a, s.b) === tb.em)) &&
        (s.tbA !== undefined || s.tbB !== undefined || s.tiebreak);

      if (isTieAtTb) {
        const tbA = s.tbA;
        const tbB = s.tbB;
        if (tbA === undefined || tbB === undefined) throw new Error("Informe o tie-break do set");
        if (tbA === tbB) throw new Error("Tie-break não pode terminar empatado");
        const winner = Math.max(tbA, tbB);
        const loser = Math.min(tbA, tbB);
        if (winner < tb.ate) throw new Error("Tie-break precisa atingir a pontuação mínima");
        if (winner - loser < tb.diffMin) throw new Error("Tie-break precisa ter diferença mínima");

        if (tbA > tbB) setsA += 1;
        else setsB += 1;

        const aFinal = tbA > tbB ? tb.em + 1 : tb.em;
        const bFinal = tbB > tbA ? tb.em + 1 : tb.em;
        normalized.push({ set: setIndex, a: aFinal, b: bFinal, tiebreak: true, tbA, tbB });
      } else {
        const winner = Math.max(s.a, s.b);
        const loser = Math.min(s.a, s.b);
        if (s.a === s.b) throw new Error("Set não pode terminar empatado");
        if (winner < games) throw new Error("Set precisa atingir a pontuação mínima");

        const isNoTieBreakCapWin = !tb.habilitado && winner === games;
        const isNormalWin = tb.habilitado && winner === games && winner - loser >= 2;
        const isExtendedWin = tb.habilitado && winner === games + 1 && loser === games - 1 && winner - loser === 2;
        const isTieBreakWin = tb.habilitado && winner === tb.ate && loser === tb.ate - 1;

        if (!isNoTieBreakCapWin && !isNormalWin && !isExtendedWin && !isTieBreakWin) {
          throw new Error("Placar do set inválido para a regra configurada");
        }

        if (s.a > s.b) setsA += 1;
        else setsB += 1;

        normalized.push({ set: setIndex, a: s.a, b: s.b, tiebreak: isTieBreakWin });
      }
    }

    if (setsA === setsNeeded || setsB === setsNeeded) {
      if (i !== detalhes.length - 1) throw new Error("Existem sets extras após a definição do vencedor");
    }
  }

  if (setsA !== setsNeeded && setsB !== setsNeeded) {
    throw new Error("Placar incompleto para definir vencedor");
  }

  const vencedorId = setsA > setsB ? params.equipeAId : params.equipeBId;
  return { placarA: setsA, placarB: setsB, vencedorId, detalhesPlacar: normalized };
}

export function calcularResultadoVoleiSets(params: {
  regras: RegrasPartidaVoleiSets;
  equipeAId: string;
  equipeBId: string;
  detalhesPlacar: SetScore[];
}): ResultadoPartidaCalculado {
  const regras = params.regras;
  const detalhes = normalizarDetalhesPlacar(params.detalhesPlacar);
  const setsNeeded = regras.melhorDe === 5 ? 3 : 2;
  const maxSets = regras.melhorDe;

  if (detalhes.length === 0) throw new Error("Informe o placar por set");
  if (detalhes.length > maxSets) throw new Error("Quantidade de sets invalida para a regra de jogo");

  let setsA = 0;
  let setsB = 0;
  const normalized: SetScore[] = [];

  for (let i = 0; i < detalhes.length; i++) {
    const s = detalhes[i];
    const setIndex = i + 1;
    const isTieBreakDecisivo = Boolean(regras.tieBreakDecisivo?.habilitado) && setIndex === maxSets;
    const alvo = isTieBreakDecisivo ? regras.tieBreakDecisivo?.ate ?? 15 : regras.pontosPorSet;
    const diffMin = isTieBreakDecisivo ? regras.tieBreakDecisivo?.diffMin ?? 2 : regras.diffMin;
    const winner = Math.max(s.a, s.b);
    const loser = Math.min(s.a, s.b);

    if (s.a === s.b) throw new Error("Set nao pode terminar empatado");
    if (winner < alvo) throw new Error("Set precisa atingir a pontuacao minima");
    if (winner - loser < diffMin) throw new Error("Set precisa ter diferenca minima");

    if (s.a > s.b) setsA += 1;
    else setsB += 1;

    normalized.push({ set: setIndex, a: s.a, b: s.b, tiebreak: isTieBreakDecisivo });

    if ((setsA === setsNeeded || setsB === setsNeeded) && i !== detalhes.length - 1) {
      throw new Error("Existem sets extras apos a definicao do vencedor");
    }
  }

  if (setsA !== setsNeeded && setsB !== setsNeeded) {
    throw new Error("Placar incompleto para definir vencedor");
  }

  const vencedorId = setsA > setsB ? params.equipeAId : params.equipeBId;
  return { placarA: setsA, placarB: setsB, vencedorId, detalhesPlacar: normalized };
}

export function calcularResultadoPartida(params: {
  regras: RegrasPartidaConfig | RegrasPartidaSets;
  equipeAId: string;
  equipeBId: string;
  detalhesPlacar: SetScore[];
}): ResultadoPartidaCalculado {
  if (isRegrasVoleiSets(params.regras)) {
    return calcularResultadoVoleiSets(params as {
      regras: RegrasPartidaVoleiSets;
      equipeAId: string;
      equipeBId: string;
      detalhesPlacar: SetScore[];
    });
  }

  if (isRegrasBeachTennisSets(params.regras)) {
    return calcularResultadoBeachTennisSets(params as {
      regras: RegrasPartidaBTSets | RegrasPartidaSets;
      equipeAId: string;
      equipeBId: string;
      detalhesPlacar: SetScore[];
    });
  }

  throw new Error("Regra de partida invalida");
}

export function calcularResultadoSets(params: {
  regras: RegrasPartidaBTSets | RegrasPartidaSets;
  equipeAId: string;
  equipeBId: string;
  detalhesPlacar: SetScore[];
}) {
  return calcularResultadoBeachTennisSets(params);
}
