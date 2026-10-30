// Desenho dos cards de jogo, sem depender do navegador: o admin desenha num <canvas> (match-card-client.ts)
// e a rota publica do card desenha no servidor com @napi-rs/canvas. Os dois passam pelas mesmas funcoes daqui.

export type PartidaCardInfo = {
  id: string;
  fase?: string | null;
  placarA?: number | null;
  placarB?: number | null;
  detalhesPlacar?: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  rodadaNome?: string | null;
  rodadaNumero?: number | null;
  dataHorario?: string | null;
  arenaNome?: string | null;
  quadra?: string | null;
  equipeANome?: string | null;
  equipeBNome?: string | null;
  equipeAAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
  equipeBAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
};

/** Imagem desenhavel: HTMLImageElement no navegador, Image do @napi-rs/canvas no servidor. */
export type ImagemCard = CanvasImageSource & { width: number; height: number };

export type DadosCardPartida = {
  categoriaNome: string;
  cardApenasComFotos?: boolean;
  templateUrl?: string | null;
  partida: PartidaCardInfo;
};

/** O que muda entre navegador e servidor: como carregar imagens, fotos atualizadas e fontes. */
export type AmbienteCard = {
  carregarImagem: (url: string) => Promise<ImagemCard | null>;
  fotosSincronizadas: Map<string, string>;
  fontes: FontesCard;
};

/** Modelo do card pelo campo do torneio; sem ele, NEXT_PUBLIC_CARD_LAYOUT=novo liga o novo (padrao: classico). */
export function layoutClassicoDoTorneio(layoutTorneio?: string | null) {
  if (layoutTorneio) return layoutTorneio.toUpperCase() === "CLASSICO";
  return (process.env.NEXT_PUBLIC_CARD_LAYOUT || "").toLowerCase() !== "novo";
}

export function nomePrimeiroEUltimo(nome?: string | null) {
  const partes = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (partes.length <= 2) {
    return partes.join(" ") || "Atleta";
  }

  return `${partes[0]} ${partes[partes.length - 1]}`;
}

export function iniciaisNome(nome: string) {
  const partes = nome.trim().split(/\s+/).slice(0, 2);
  if (!partes.length) return "AT";
  return partes.map((p) => p.slice(0, 1).toUpperCase()).join("");
}

export function desenharAvatarFallback(ctx: CanvasRenderingContext2D, x: number, y: number, tamanho: number, nome: string) {
  const grad = ctx.createLinearGradient(x, y, x + tamanho, y + tamanho);
  grad.addColorStop(0, "#334155");
  grad.addColorStop(1, "#0f172a");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x + tamanho / 2, y + tamanho / 2, tamanho / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e2e8f0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(tamanho * 0.28)}px Inter, Arial, sans-serif`;
  ctx.fillText(iniciaisNome(nome), x + tamanho / 2, y + tamanho / 2);
}

export function desenharAvatarImagem(ctx: CanvasRenderingContext2D, image: ImagemCard, x: number, y: number, tamanho: number) {
  const centerX = x + tamanho / 2;
  const centerY = y + tamanho / 2;
  const radius = tamanho / 2;
  const scale = Math.max(tamanho / image.width, tamanho / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawX = centerX - drawW / 2;
  const drawY = centerY - drawH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
  ctx.restore();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 2.5, 0, Math.PI * 2);
  ctx.stroke();
}

export function desenharTextoSimples(ctx: CanvasRenderingContext2D, x: number, y: number, tamanho: number) {
  const centerX = x + tamanho / 2;
  const centerY = y + tamanho / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#facc15";
  ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
  ctx.lineWidth = 8;
  ctx.font = "900 56px Inter, Arial, sans-serif";
  ctx.strokeText("SIMPLES", centerX, centerY);
  ctx.fillText("SIMPLES", centerX, centerY);
  ctx.restore();
}

export function formatarDataHora(value?: string | null) {
  if (!value) return "Data a definir";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Data a definir";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDataProgramacao(value?: string | null) {
  if (!value) return { data: "A definir", hora: "--:--" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { data: "A definir", hora: "--:--" };
  return {
    data: d.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
    }),
    hora: d.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export function normalizeCardText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function formatarPlacarPartida(partida: PartidaCardInfo) {
  const detalhes = partida.detalhesPlacar ?? [];
  if (detalhes.length > 0) {
    return detalhes
      .slice()
      .sort((a, b) => a.set - b.set)
      .map((s) => {
        if (s.tiebreak && s.tbA !== undefined && s.tbB !== undefined) return `${s.a}-${s.b}(${s.tbA}-${s.tbB})`;
        return `${s.a}-${s.b}`;
      })
      .join(" ");
  }
  const a = Number(partida.placarA ?? 0);
  const b = Number(partida.placarB ?? 0);
  if (a > 0 || b > 0) return `${a} x ${b}`;
  return "";
}

export function fotoAtletaOuAvatar(atleta?: { nome: string; fotoUrl?: string | null } | null) {
  if (!atleta) return null;
  if (atleta.fotoUrl && atleta.fotoUrl.trim()) return atleta.fotoUrl;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(atleta.nome || "Atleta")}&background=random&color=fff&size=256`;
}


export function separarPrimeiroUltimoNome(nomeCompleto: string): { primeiroNome: string; ultimoNome: string } {
  const tokens = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { primeiroNome: "Atleta", ultimoNome: "" };
  if (tokens.length === 1) return { primeiroNome: tokens[0], ultimoNome: "" };
  return { primeiroNome: tokens[0], ultimoNome: tokens[tokens.length - 1] };
}

export function drawTextCenter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return lines.length;
}

export function drawTextLeft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return lines.length;
}

export function fitTextSingleLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const value = text.trim();
  if (!value) return "";
  if (ctx.measureText(value).width <= maxWidth) return value;

  let truncated = value;
  while (truncated.length > 1 && ctx.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1).trimEnd();
  }

  return truncated.length < value.length ? `${truncated}...` : truncated;
}

export const CARD_W = 1080;
export const CARD_H = 1920;
export const MARGEM_TOPO = 600;
export const MARGEM_BASE = 1660;
export const COR_DESTAQUE = "#35c9e0";
export const COR_FUNDO_BLOCO = "rgba(6,18,28,0.74)";

export type FontesCard = { titulo: string; texto: string };

export function caminhoArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function desenharBloco(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, destaque = false) {
  caminhoArredondado(ctx, x, y, w, h, 28);
  ctx.fillStyle = COR_FUNDO_BLOCO;
  ctx.fill();
  ctx.lineWidth = destaque ? 4 : 2;
  ctx.strokeStyle = destaque ? COR_DESTAQUE : "rgba(255,255,255,0.14)";
  ctx.stroke();
}

/** Avatar do atleta: foto recortada em circulo ou iniciais em negrito, sempre com aro na cor de destaque. */
export function desenharAvatarNovo(
  ctx: CanvasRenderingContext2D,
  imagem: ImagemCard | null,
  nome: string,
  x: number,
  y: number,
  tamanho: number,
  fontes: FontesCard,
) {
  const cx = x + tamanho / 2;
  const cy = y + tamanho / 2;
  const raio = tamanho / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, Math.PI * 2);
  ctx.clip();
  if (imagem) {
    const escala = Math.max(tamanho / imagem.width, tamanho / imagem.height);
    const w = imagem.width * escala;
    const h = imagem.height * escala;
    ctx.drawImage(imagem, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = "#0b3a52";
    ctx.fillRect(x, y, tamanho, tamanho);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(tamanho * 0.38)}px ${fontes.titulo}`;
    ctx.fillText(iniciaisNome(nome || "Atleta"), cx, cy + tamanho * 0.02);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(5, Math.round(tamanho * 0.028));
  ctx.strokeStyle = COR_DESTAQUE;
  ctx.beginPath();
  ctx.arc(cx, cy, raio - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
}

/** Diminui a fonte ate o texto caber; se ainda nao couber, corta com reticencias. */
export function textoCabendo(
  ctx: CanvasRenderingContext2D,
  texto: string,
  fonteBase: (px: number) => string,
  pxInicial: number,
  pxMinimo: number,
  larguraMax: number,
) {
  let px = pxInicial;
  ctx.font = fonteBase(px);
  while (px > pxMinimo && ctx.measureText(texto).width > larguraMax) {
    px -= 2;
    ctx.font = fonteBase(px);
  }
  return fitTextSingleLine(ctx, texto, larguraMax);
}

export const ROTULO_FASE: Record<string, string> = {
  GRUPOS: "Grupos",
  OITAVAS: "Oitavas",
  QUARTAS: "Quartas",
  SEMI: "Semifinal",
  FINAL: "Final",
  TERCEIRO_LUGAR: "3º lugar",
};

export function carregarFotosAtletas(atletas: { nome: string; fotoUrl?: string | null }[], carregarImagem: AmbienteCard["carregarImagem"]) {
  // sem foto: nada de avatar externo, o gerador desenha as iniciais
  return Promise.all(atletas.map((a) => (a.fotoUrl && a.fotoUrl.trim() ? carregarImagem(a.fotoUrl) : Promise.resolve(null))));
}

/** Card de jogo no modelo classico (1080x1920). */
export async function desenharCardPartidaClassico(ctx: CanvasRenderingContext2D, params: DadosCardPartida, amb: AmbienteCard) {
  const width = CARD_W;
  const height = CARD_H;

  const template = params.templateUrl ? await amb.carregarImagem(params.templateUrl) : null;
  if (template) {
    ctx.drawImage(template, 0, 0, width, height);
  } else {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1e293b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(2,6,23,0.18)");
  overlay.addColorStop(0.55, "rgba(2,6,23,0.08)");
  overlay.addColorStop(1, "rgba(2,6,23,0.22)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  const fotosSincronizadas = amb.fotosSincronizadas;
  const atletasA = (params.partida.equipeAAtletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const atletasB = (params.partida.equipeBAtletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const fotosA = await Promise.all(atletasA.map((a) => {
    const url = fotoAtletaOuAvatar(a);
    return url ? amb.carregarImagem(url) : Promise.resolve(null);
  }));
  const fotosB = await Promise.all(atletasB.map((a) => {
    const url = fotoAtletaOuAvatar(a);
    return url ? amb.carregarImagem(url) : Promise.resolve(null);
  }));
  const tamanhoAvatar = 310;
  const ajusteNomesY = 56;
  const larguraNome = 310;
  const categoriaEhSimples = atletasA.length <= 1 && atletasB.length <= 1;
  const posicoes = categoriaEhSimples
    ? [
        { x: 35, y: 735, atleta: atletasA[0], imagem: fotosA[0], tipo: "atleta" as const },
        { x: 480, y: 622, tipo: "simples" as const },
        { x: 67, y: 1305, tipo: "simples" as const },
        { x: 515, y: 1182, atleta: atletasB[0], imagem: fotosB[0], tipo: "atleta" as const },
      ]
    : [
        { x: 35, y: 735, atleta: atletasA[0], imagem: fotosA[0], tipo: "atleta" as const },
        { x: 465, y: 632, atleta: atletasA[1], imagem: fotosA[1], tipo: "atleta" as const },
        { x: 55, y: 1290, atleta: atletasB[0], imagem: fotosB[0], tipo: "atleta" as const },
        { x: 515, y: 1197, atleta: atletasB[1], imagem: fotosB[1], tipo: "atleta" as const },
      ];
  for (const p of posicoes) {
    if (p.tipo === "simples") {
      desenharTextoSimples(ctx, p.x, p.y, tamanhoAvatar);
      continue;
    }
    const nome = p.atleta?.nome || "Atleta";
    if (p.imagem) {
      desenharAvatarImagem(ctx, p.imagem, p.x, p.y, tamanhoAvatar);
    } else {
      desenharAvatarFallback(ctx, p.x, p.y, tamanhoAvatar, nome);
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";

  if (!params.cardApenasComFotos) {
    const local = params.partida.arenaNome
      ? `${params.partida.arenaNome}${params.partida.quadra ? ` • ${params.partida.quadra}` : ""}`
      : "Arena a definir";
    const linhaX = 76;
    const valorX = 320;
    const yCategoria = 378;
    const yData = 448;
    const yArena = 518;
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 42px Inter, Arial, sans-serif";
    ctx.fillText("Categoria:", linhaX, yCategoria);
    ctx.fillText("Data:", linhaX, yData);
    ctx.fillText("Arena:", linhaX, yArena);
    ctx.font = "700 34px Inter, Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    drawTextLeft(ctx, params.categoriaNome || "A definir", valorX, yCategoria + 10, 650, 40);
    drawTextLeft(ctx, formatarDataHora(params.partida.dataHorario), valorX, yData + 10, 650, 40);
    drawTextLeft(ctx, local, valorX, yArena + 10, 650, 40);
  }

  const placarTexto = formatarPlacarPartida(params.partida);
  if (placarTexto) {
    ctx.fillStyle = "rgba(16,185,129,0.15)";
    const boxX = 70;
    const boxY = 1620;
    const boxW = 940;
    const boxH = 92;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "rgba(16,185,129,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#dcfce7";
    ctx.font = "700 40px Inter, Arial, sans-serif";
    ctx.fillText(`PLACAR: ${placarTexto}`, boxX + boxW / 2, boxY + boxH / 2);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "700 22px Inter, Arial, sans-serif";
  for (const p of posicoes) {
    if (p.tipo === "simples") continue;
    const nomeCompleto = p.atleta?.nome || "Atleta";
    const { primeiroNome, ultimoNome } = separarPrimeiroUltimoNome(nomeCompleto);
    const centroX = p.x + tamanhoAvatar / 2;
    const linhaY = p.y + tamanhoAvatar + ajusteNomesY;
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 22px Inter, Arial, sans-serif";
    drawTextCenter(ctx, primeiroNome, centroX, linhaY, larguraNome, 28);
    if (ultimoNome) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 18px Inter, Arial, sans-serif";
      drawTextCenter(ctx, ultimoNome, centroX, linhaY + 28, larguraNome, 22);
    }
  }
}

/** Card de jogo no modelo novo (1080x1920): programacao antes do jogo, resultado depois. */
export async function desenharCardPartidaNovo(ctx: CanvasRenderingContext2D, params: DadosCardPartida, amb: AmbienteCard) {
  const template = params.templateUrl ? await amb.carregarImagem(params.templateUrl) : null;
  if (template) {
    ctx.drawImage(template, 0, 0, CARD_W, CARD_H);
  } else {
    ctx.fillStyle = "#06121c";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }
  const fontes = amb.fontes;
  const partida = params.partida;

  const fotosSincronizadas = amb.fotosSincronizadas;
  const comFotoSincronizada = (lista?: { id: string; nome: string; fotoUrl?: string | null }[]) =>
    (lista ?? []).slice(0, 2).map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const atletasA = comFotoSincronizada(partida.equipeAAtletas);
  const atletasB = comFotoSincronizada(partida.equipeBAtletas);
  const [fotosA, fotosB] = await Promise.all([carregarFotosAtletas(atletasA, amb.carregarImagem), carregarFotosAtletas(atletasB, amb.carregarImagem)]);

  const sets = (partida.detalhesPlacar ?? []).slice().sort((a, b) => a.set - b.set);
  const temPlacar = sets.length > 0 || Number(partida.placarA ?? 0) > 0 || Number(partida.placarB ?? 0) > 0;
  let setsA = 0;
  let setsB = 0;
  for (const s of sets) {
    if (s.a > s.b) setsA += 1;
    else if (s.b > s.a) setsB += 1;
    else if (s.tiebreak && s.tbA !== undefined && s.tbB !== undefined) {
      if (s.tbA > s.tbB) setsA += 1;
      else if (s.tbB > s.tbA) setsB += 1;
    }
  }
  const pontosA = sets.length ? setsA : Number(partida.placarA ?? 0);
  const pontosB = sets.length ? setsB : Number(partida.placarB ?? 0);
  const vencedor: "A" | "B" | null = temPlacar && pontosA !== pontosB ? (pontosA > pontosB ? "A" : "B") : null;

  const data = partida.dataHorario ? new Date(partida.dataHorario) : null;
  const dataValida = data && !Number.isNaN(data.getTime()) ? data : null;
  const local = [partida.quadra ? `Quadra ${partida.quadra}` : null, partida.arenaNome || null].filter(Boolean).join(" · ");

  const margemX = 90;
  const larguraUtil = CARD_W - margemX * 2;
  let y = MARGEM_TOPO + 20;

  if (!params.cardApenasComFotos) {
    const fase = partida.fase ? ROTULO_FASE[partida.fase] ?? partida.fase : null;
    const linhaTopo = [params.categoriaNome, partida.rodadaNome || fase].filter(Boolean).join(" · ").toUpperCase();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = COR_DESTAQUE;
    ctx.fillText(textoCabendo(ctx, linhaTopo, (px) => `700 ${px}px ${fontes.titulo}`, 38, 26, larguraUtil), margemX, y);
    y += 50;

    let titulo: string;
    let subtitulo: string;
    if (temPlacar) {
      titulo = "RESULTADO";
      subtitulo = local;
    } else if (dataValida) {
      const dia = dataValida
        .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short" })
        .replace(".", "")
        .toUpperCase();
      const hora = dataValida.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
      titulo = `${dia} ${hora}`;
      const diaMes = dataValida.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
      subtitulo = [diaMes, local].filter(Boolean).join(" · ");
    } else {
      titulo = "Horário em breve";
      subtitulo = local || "A organização divulga quadra e horário";
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillText(textoCabendo(ctx, titulo, (px) => `700 ${px}px ${fontes.titulo}`, 150, 90, larguraUtil), margemX, y);
    y += 158;
    if (subtitulo) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(textoCabendo(ctx, subtitulo, (px) => `800 ${px}px ${fontes.texto}`, 40, 28, larguraUtil), margemX, y);
    }
  }

  // Duplas: bloco A, VS, bloco B
  const alturaBloco = 218;
  const alturaVs = 76;
  const blocoTopo = Math.max(y + 90, 900);
  const tamanhoAvatar = 170;
  type Atleta = { id: string; nome: string; fotoUrl?: string | null };
  const blocos: Array<{ lado: "A" | "B"; atletas: Atleta[]; fotos: (ImagemCard | null)[]; nomeEquipe?: string | null; y: number }> = [
    { lado: "A", atletas: atletasA, fotos: fotosA, nomeEquipe: partida.equipeANome, y: blocoTopo },
    { lado: "B", atletas: atletasB, fotos: fotosB, nomeEquipe: partida.equipeBNome, y: blocoTopo + alturaBloco + alturaVs },
  ];

  for (const bloco of blocos) {
    const venceu = vencedor === bloco.lado;
    desenharBloco(ctx, margemX, bloco.y, larguraUtil, alturaBloco, venceu);

    const atletas: Atleta[] = bloco.atletas.length ? bloco.atletas : [{ id: "", nome: bloco.nomeEquipe || "A definir", fotoUrl: null }];
    const avatarY = bloco.y + (alturaBloco - tamanhoAvatar) / 2;
    let avatarX = margemX + 30;
    atletas.forEach((a, idx) => {
      desenharAvatarNovo(ctx, bloco.fotos[idx] ?? null, a.nome, avatarX, avatarY, tamanhoAvatar, fontes);
      avatarX += tamanhoAvatar - 34;
    });

    // placar por set a direita (quando houver)
    let direita = margemX + larguraUtil - 30;
    if (temPlacar) {
      const valores = sets.length
        ? sets.map((s) => String(bloco.lado === "A" ? s.a : s.b))
        : [String(bloco.lado === "A" ? partida.placarA ?? 0 : partida.placarB ?? 0)];
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = `700 92px ${fontes.titulo}`;
      ctx.fillStyle = venceu ? COR_DESTAQUE : "rgba(255,255,255,0.55)";
      for (let i = valores.length - 1; i >= 0; i -= 1) {
        ctx.fillText(valores[i], direita, bloco.y + alturaBloco / 2 + 4);
        direita -= ctx.measureText(valores[i]).width + 26;
      }
      direita -= 10;
    }

    const nomesX = avatarX + 34 + 26;
    const larguraNomes = Math.max(120, direita - nomesX);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    const nomes = atletas.map((a) => nomePrimeiroEUltimo(a.nome));
    const centroY = bloco.y + alturaBloco / 2;
    if (nomes.length === 1) {
      ctx.fillText(textoCabendo(ctx, nomes[0], (px) => `700 ${px}px ${fontes.titulo}`, 52, 32, larguraNomes), nomesX, centroY);
    } else {
      ctx.fillText(textoCabendo(ctx, nomes[0], (px) => `700 ${px}px ${fontes.titulo}`, 48, 30, larguraNomes), nomesX, centroY - 28);
      ctx.fillText(textoCabendo(ctx, nomes[1], (px) => `700 ${px}px ${fontes.titulo}`, 48, 30, larguraNomes), nomesX, centroY + 28);
    }
  }

  // VS entre os blocos
  const vsY = blocoTopo + alturaBloco + alturaVs / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(margemX, vsY);
  ctx.lineTo(CARD_W / 2 - 60, vsY);
  ctx.moveTo(CARD_W / 2 + 60, vsY);
  ctx.lineTo(margemX + larguraUtil, vsY);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COR_DESTAQUE;
  ctx.font = `italic 700 64px ${fontes.titulo}`;
  ctx.fillText("VS", CARD_W / 2, vsY + 2);
}
