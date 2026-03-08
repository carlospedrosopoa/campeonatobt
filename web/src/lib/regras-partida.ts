export type RegrasPartidaSets = {
  tipo: "SETS";
  melhorDe: 1 | 3;
  gamesPorSet: 4 | 6;
  tiebreak: { habilitado: boolean; em: number; ate: number; diffMin: number };
  superTiebreakDecisivo?: { habilitado: boolean; ate: number; diffMin: number };
};

export type SetScore = { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number };

export function calcularResultadoSets(params: {
  regras: RegrasPartidaSets;
  equipeAId: string;
  equipeBId: string;
  detalhesPlacar: SetScore[];
}) {
  const regras = params.regras;
  const detalhes = (Array.isArray(params.detalhesPlacar) ? params.detalhesPlacar : [])
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

        const isNormalWin = winner === games && winner - loser >= 2;
        const isExtendedWin = winner === games + 1 && loser === games - 1 && winner - loser === 2;
        const isTieBreakWin = tb.habilitado && winner === tb.ate && loser === tb.ate - 1;

        if (!isNormalWin && !isExtendedWin && !isTieBreakWin) {
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
