import * as XLSX from "xlsx";

export type SuperImportAtletaRef = {
  nomeOriginal: string;
  nomeNormalizado: string;
};

export type SuperImportJogoPreview = {
  rodadaNome: string;
  rodadaNumero: number | null;
  dataLimiteTexto: string | null;
  duplaA: { texto: string; atletas: SuperImportAtletaRef[] };
  duplaB: { texto: string; atletas: SuperImportAtletaRef[] };
  arenaNome: string | null;
  dataHorarioTexto: string | null;
  placarTexto: string | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  warnings: string[];
};

export type SuperImportPreview = {
  sheetName: string;
  atletas: SuperImportAtletaRef[];
  arenas: string[];
  rodadas: Array<{
    nome: string;
    numero: number | null;
    dataLimiteTexto: string | null;
    jogos: SuperImportJogoPreview[];
  }>;
  totalJogos: number;
  warnings: string[];
};

function normalizarTexto(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function toText(value: any) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function parseDupla(value: any): { texto: string; atletas: SuperImportAtletaRef[] } | null {
  const texto = toText(value);
  if (!texto) return null;
  const parts = texto
    .split(/\s+e\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return { texto, atletas: [] };
  return {
    texto,
    atletas: parts.map((nomeOriginal) => ({ nomeOriginal, nomeNormalizado: normalizarTexto(nomeOriginal) })),
  };
}

function parsePlacarTexto(placar: any) {
  const raw = toText(placar);
  const cleaned = raw
    .replaceAll("\u00A0", " ")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .trim();
  if (!cleaned) return { placarTexto: null as string | null, detalhes: null as any[] | null, warning: null as string | null };
  if (/^\s*(wo|w\.o\.?)\s*$/i.test(cleaned) || cleaned.toLowerCase().includes("wo")) {
    return { placarTexto: cleaned, detalhes: null, warning: "Placar com WO detectado (ignorado na importação de sets)." };
  }

  const detalhes: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }> = [];
  const normalized = cleaned.replaceAll("X", "x");
  const re = /(\d{1,2})\s*[-/x:]\s*(\d{1,2})/g;
  for (const m of normalized.matchAll(re)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    detalhes.push({ set: detalhes.length + 1, a, b });
  }

  if (detalhes.length === 0) {
    return { placarTexto: cleaned, detalhes: null, warning: "Não foi possível interpretar o placar em sets." };
  }
  return { placarTexto: cleaned, detalhes, warning: null };
}

function looksLikeRodadaRow(row: any[]) {
  const joined = row.map((c) => toText(c)).filter(Boolean).join(" ");
  return /rodada/i.test(joined);
}

function parseRodadaTitulo(row: any[]) {
  const joined = row.map((c) => toText(c)).filter(Boolean).join(" ").trim();
  if (!joined) return null;
  if (!/rodada/i.test(joined)) return null;
  const numMatch = joined.match(/(\d+)\s*ª?\s*rodada/i);
  const numero = numMatch ? Number(numMatch[1]) : null;
  const dataLimiteMatch = joined.match(/encerra\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
  const dataLimiteTexto = dataLimiteMatch ? dataLimiteMatch[1] : null;
  return { nome: joined, numero: Number.isFinite(numero) ? numero : null, dataLimiteTexto };
}

function parseHeaderMap(row: any[]) {
  const map: Record<string, number> = {};
  for (let i = 0; i < row.length; i++) {
    const t = normalizarTexto(toText(row[i]));
    if (!t) continue;
    if (t.includes("dupla a") || t === "dupla 1" || t.includes("equipe a")) map.duplaA = i;
    if (t.includes("dupla b") || t === "dupla 2" || t.includes("equipe b")) map.duplaB = i;
    if (t === "data") map.data = i;
    if (t.includes("hora")) map.hora = i;
    if (t.includes("quadra") || t.includes("local") || t.includes("arena")) map.quadra = i;
    if (t.includes("placar") || t.includes("resultado")) map.placar = i;
    if (t.startsWith("set 1") || t === "1o set" || t === "1º set") map.set1 = i;
    if (t.startsWith("set 2") || t === "2o set" || t === "2º set") map.set2 = i;
    if (t.startsWith("set 3") || t === "st" || t.includes("super tie")) map.set3 = i;
  }
  const hasPlacares = map.placar !== undefined || (map.set1 !== undefined && map.set2 !== undefined);
  if (!hasPlacares) return null;
  return map;
}

function parseDataHorarioTexto(row: any[], map: Record<string, number> | null) {
  const data = map?.data !== undefined ? row[map.data] : row[0];
  const hora = map?.hora !== undefined ? row[map.hora] : row[1];
  const dataTxt = toText(data);
  if (/\bwo\b/i.test(dataTxt) || /\bw\.o\b/i.test(dataTxt) || normalizarTexto(dataTxt) === "w.o") return null;
  const horaTxt = toText(hora);
  const joined = [dataTxt, horaTxt].map((s) => s.trim()).filter(Boolean).join(" ");
  return joined ? joined : null;
}

function parseArenaTexto(row: any[], map: Record<string, number> | null) {
  const raw = map?.quadra !== undefined ? row[map.quadra] : row[2];
  const t = toText(raw);
  return t ? t : null;
}

function parseRowJogo(row: any[], map: Record<string, number> | null, rodada: { nome: string; numero: number | null; dataLimiteTexto: string | null }) {
  const warnings: string[] = [];

  function isX(value: any) {
    const t = toText(value);
    return normalizarTexto(t) === "x";
  }

  function toNum(value: any) {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function parseTripleAt(startIndex: number | undefined) {
    if (startIndex === undefined) return null as null | { a: number; b: number };
    const a = toNum(row[startIndex]);
    const mid = row[startIndex + 1];
    const b = toNum(row[startIndex + 2]);
    if (a === null || b === null) return null;
    if (!isX(mid)) return null;
    return { a, b };
  }

  function scanTriplesAcrossRow() {
    const triples: Array<{ a: number; b: number; idx: number }> = [];
    for (let i = 0; i < row.length - 2; i++) {
      const a = toNum(row[i]);
      const b = toNum(row[i + 2]);
      if (a === null || b === null) continue;
      if (!isX(row[i + 1])) continue;
      triples.push({ a, b, idx: i });
      i += 2;
    }
    return triples;
  }

  let duplaAValue: any = null;
  let duplaBValue: any = null;
  if (map?.duplaA !== undefined) duplaAValue = row[map.duplaA];
  if (map?.duplaB !== undefined) duplaBValue = row[map.duplaB];

  if ((!duplaAValue || !duplaBValue) && map?.set1 !== undefined && map.set1 >= 3) {
    const start = map.set1 - 3;
    if (start >= 0 && isX(row[start + 1])) {
      duplaAValue = row[start];
      duplaBValue = row[start + 2];
    }
  }

  if (!duplaAValue || !duplaBValue) {
    const candidates = row
      .map((c, idx) => ({ idx, t: toText(c) }))
      .filter((x) => /\s+e\s+/i.test(x.t));
    if (candidates.length >= 2) {
      duplaAValue = candidates[0].t;
      duplaBValue = candidates[1].t;
    }
  }

  const duplaAParsed = parseDupla(duplaAValue);
  const duplaBParsed = parseDupla(duplaBValue);
  if (!duplaAParsed || !duplaBParsed) return null;

  if (duplaAParsed.atletas.length !== 2) warnings.push(`Dupla A fora do padrão "nome1 e nome2": "${duplaAParsed.texto}"`);
  if (duplaBParsed.atletas.length !== 2) warnings.push(`Dupla B fora do padrão "nome1 e nome2": "${duplaBParsed.texto}"`);

  let detalhesPlacar: any[] | null = null;
  let placarTexto: string | null = null;

  const sets: any[] = [];

  const t1 = parseTripleAt(map?.set1);
  const t2 = parseTripleAt(map?.set2);
  const t3 = parseTripleAt(map?.set3);

  if (t1) sets.push({ set: 1, a: t1.a, b: t1.b });
  if (t2) sets.push({ set: 2, a: t2.a, b: t2.b });
  if (t3) sets.push({ set: 3, a: t3.a, b: t3.b, tiebreak: true });

  if (sets.length === 0) {
    const triples = scanTriplesAcrossRow();
    for (let i = 0; i < triples.length && sets.length < 3; i++) {
      const t = triples[i];
      const setIndex = sets.length + 1;
      sets.push({ set: setIndex, a: t.a, b: t.b, ...(setIndex === 3 ? { tiebreak: true } : {}) });
    }
  }

  if (sets.length >= 2) {
    detalhesPlacar = sets;
    placarTexto = sets
      .map((s) => `${s.a}x${s.b}`)
      .join(" ");
  } else {
    const rawPlacar = map?.placar !== undefined ? row[map.placar] : null;
    const parsed = parsePlacarTexto(rawPlacar ?? row.find((c) => /\d{1,2}\s*[-/x:]\s*\d{1,2}/.test(toText(c))) ?? "");
    placarTexto = parsed.placarTexto;
    detalhesPlacar = parsed.detalhes;
    if (parsed.warning) warnings.push(parsed.warning);
  }

  const arenaNome = parseArenaTexto(row, map);
  const dataHorarioTexto = parseDataHorarioTexto(row, map);

  return {
    rodadaNome: rodada.nome,
    rodadaNumero: rodada.numero,
    dataLimiteTexto: rodada.dataLimiteTexto,
    duplaA: duplaAParsed,
    duplaB: duplaBParsed,
    arenaNome,
    dataHorarioTexto,
    placarTexto,
    detalhesPlacar,
    warnings,
  } satisfies Omit<SuperImportJogoPreview, "warnings"> & { warnings: string[] };
}

export function parseSuperCampeonatoResultadosXlsx(buffer: Buffer): SuperImportPreview {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const targetName =
    wb.SheetNames.find((n) => normalizarTexto(n) === "resultados") ??
    wb.SheetNames.find((n) => normalizarTexto(n).includes("resultado")) ??
    "";
  if (!targetName) throw new Error('Aba "Resultados" não encontrada no arquivo.');
  const sheet = wb.Sheets[targetName];
  if (!sheet) throw new Error('Aba "Resultados" não encontrada no arquivo.');

  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as any[][];

  const atletasMap = new Map<string, string>();
  const arenasSet = new Set<string>();
  const warnings: string[] = [];

  const rodadas: SuperImportPreview["rodadas"] = [];

  let currentRodada: { nome: string; numero: number | null; dataLimiteTexto: string | null } | null = null;
  let currentHeader: Record<string, number> | null = null;

  for (let r = 0; r < table.length; r++) {
    const row = table[r] ?? [];
    const rowText = row.map((c) => toText(c)).filter(Boolean).join(" ").trim();
    if (!rowText) continue;

    if (looksLikeRodadaRow(row)) {
      const rodada = parseRodadaTitulo(row);
      if (rodada) {
        currentRodada = rodada;
        currentHeader = null;
        rodadas.push({ nome: rodada.nome, numero: rodada.numero, dataLimiteTexto: rodada.dataLimiteTexto, jogos: [] });
        continue;
      }
    }

    if (!currentRodada) continue;

    if (!currentHeader) {
      const hm = parseHeaderMap(row);
      if (hm) {
        currentHeader = hm;
        continue;
      }
    }

    const jogo = parseRowJogo(row, currentHeader, currentRodada);
    if (!jogo) continue;

    const rodadaBucket = rodadas[rodadas.length - 1];
    rodadaBucket.jogos.push(jogo);

    for (const a of [...jogo.duplaA.atletas, ...jogo.duplaB.atletas]) {
      if (!a.nomeNormalizado) continue;
      if (!atletasMap.has(a.nomeNormalizado)) atletasMap.set(a.nomeNormalizado, a.nomeOriginal);
    }
    if (jogo.arenaNome) arenasSet.add(jogo.arenaNome);

    for (const w of jogo.warnings) warnings.push(`[${jogo.rodadaNome}] ${w}`);
  }

  const atletas = Array.from(atletasMap.entries())
    .map(([nomeNormalizado, nomeOriginal]) => ({ nomeOriginal, nomeNormalizado }))
    .sort((a, b) => a.nomeOriginal.localeCompare(b.nomeOriginal));

  const arenas = Array.from(arenasSet.values()).sort((a, b) => a.localeCompare(b));
  const totalJogos = rodadas.reduce((acc, r) => acc + r.jogos.length, 0);

  if (totalJogos === 0) warnings.push('Nenhum jogo foi identificado na aba "Resultados".');

  return {
    sheetName: targetName,
    atletas,
    arenas,
    rodadas,
    totalJogos,
    warnings,
  };
}
