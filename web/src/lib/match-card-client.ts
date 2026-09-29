"use client";

type PartidaCardInfo = {
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

type GerarCardParams = {
  torneioNome: string;
  categoriaNome: string;
  cardApenasComFotos?: boolean;
  /** modelo do card escolhido no torneio (NOVO | CLASSICO) */
  layout?: string | null;
  templateUrl?: string | null;
  syncFotosUrl?: string | null;
  salvarNoGcs?: boolean;
  uploadFolder?: string | null;
  persistFotoUrlApi?: string | null;
  download?: boolean;
  partida: PartidaCardInfo;
};

type InscricaoCardInfo = {
  id: string;
  status?: string | null;
  dataInscricao?: string | null;
  equipeNome?: string | null;
  categoriaId?: string | null;
  categoriaDataHorario?: string | null;
  atletas?: { id: string; nome: string; fotoUrl?: string | null }[];
};

type GerarCardInscricaoParams = {
  torneioNome: string;
  /** modelo do card escolhido no torneio (NOVO | CLASSICO) */
  layout?: string | null;
  categoriaNome: string;
  templateUrl?: string | null;
  syncFotosUrl?: string | null;
  salvarNoGcs?: boolean;
  uploadFolder?: string | null;
  download?: boolean;
  ocultarProgramacao?: boolean;
  categoriasProgramacao?: ProgramacaoCategoriaInfo[];
  tipoCardInscricao?: "TIPO_1" | "TIPO_2" | null;
  inscricao: InscricaoCardInfo;
};

type GerarCardProgramacaoParams = {
  torneioNome: string;
  categoriaNome: string;
  templateUrl?: string | null;
  syncFotosUrl?: string | null;
  salvarNoGcs?: boolean;
  uploadFolder?: string | null;
  download?: boolean;
  partida: PartidaCardInfo;
};

type ProgramacaoCategoriaInfo = {
  id: string;
  nome: string;
  genero?: string | null;
  dataHorario?: string | null;
};

type GerarCardProgramacaoTorneioParams = {
  torneioNome: string;
  templateUrl?: string | null;
  salvarNoGcs?: boolean;
  uploadFolder?: string | null;
  download?: boolean;
  categorias: ProgramacaoCategoriaInfo[];
};

type DivulgacaoDuplaInfo = {
  id: string;
  nome: string;
};

type GerarCardDuplasInscritasParams = {
  torneioNome: string;
  categoriaNome: string;
  templateUrl?: string | null;
  salvarNoGcs?: boolean;
  uploadFolder?: string | null;
  download?: boolean;
  duplas: DivulgacaoDuplaInfo[];
};

function nomePrimeiroEUltimo(nome?: string | null) {
  const partes = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (partes.length <= 2) {
    return partes.join(" ") || "Atleta";
  }

  return `${partes[0]} ${partes[partes.length - 1]}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function carregarImagem(url: string): Promise<HTMLImageElement | null> {
  try {
    const cleaned = (url || "").replace(/[`'"\s]/g, "");
    const origemDireta = cleaned.startsWith("/") || cleaned.startsWith("data:") || cleaned.startsWith("blob:");
    const resolvedUrl = origemDireta ? cleaned : `/api/image-proxy?url=${encodeURIComponent(cleaned)}`;
    const res = await fetch(resolvedUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => resolve(null);
      element.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);
    return img;
  } catch {
    return null;
  }
}

function iniciaisNome(nome: string) {
  const partes = nome.trim().split(/\s+/).slice(0, 2);
  if (!partes.length) return "AT";
  return partes.map((p) => p.slice(0, 1).toUpperCase()).join("");
}

function desenharAvatarFallback(ctx: CanvasRenderingContext2D, x: number, y: number, tamanho: number, nome: string) {
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

function desenharAvatarImagem(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, tamanho: number) {
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

function desenharTextoSimples(ctx: CanvasRenderingContext2D, x: number, y: number, tamanho: number) {
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

function formatarDataHora(value?: string | null) {
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

function formatarDataProgramacao(value?: string | null) {
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

function normalizeCardText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarPlacarPartida(partida: PartidaCardInfo) {
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

function fotoAtletaOuAvatar(atleta?: { nome: string; fotoUrl?: string | null } | null) {
  if (!atleta) return null;
  if (atleta.fotoUrl && atleta.fotoUrl.trim()) return atleta.fotoUrl;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(atleta.nome || "Atleta")}&background=random&color=fff&size=256`;
}

async function sincronizarFotosPlaynaquadra(syncFotosUrl?: string | null) {
  if (!syncFotosUrl) return new Map<string, string>();
  try {
    const res = await fetch(syncFotosUrl, { method: "POST", cache: "no-store" });
    if (!res.ok) return new Map<string, string>();
    const payload = (await res.json().catch(() => null)) as { updated?: Array<{ usuarioId: string; fotoUrl: string }> } | null;
    const map = new Map<string, string>();
    for (const item of payload?.updated ?? []) {
      if (item?.usuarioId && item?.fotoUrl) map.set(item.usuarioId, item.fotoUrl);
    }
    return map;
  } catch {
    return new Map<string, string>();
  }
}

function separarPrimeiroUltimoNome(nomeCompleto: string): { primeiroNome: string; ultimoNome: string } {
  const tokens = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { primeiroNome: "Atleta", ultimoNome: "" };
  if (tokens.length === 1) return { primeiroNome: tokens[0], ultimoNome: "" };
  return { primeiroNome: tokens[0], ultimoNome: tokens[tokens.length - 1] };
}

function drawTextCenter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
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

function drawTextLeft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
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

function fitTextSingleLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const value = text.trim();
  if (!value) return "";
  if (ctx.measureText(value).width <= maxWidth) return value;

  let truncated = value;
  while (truncated.length > 1 && ctx.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1).trimEnd();
  }

  return truncated.length < value.length ? `${truncated}...` : truncated;
}

async function gerarCardPartidaClassico(params: GerarCardParams) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas");

  const template = params.templateUrl ? await carregarImagem(params.templateUrl) : null;
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

  const fotosSincronizadas = await sincronizarFotosPlaynaquadra(params.syncFotosUrl ?? null);
  const atletasA = (params.partida.equipeAAtletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const atletasB = (params.partida.equipeBAtletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const fotosA = await Promise.all(atletasA.map((a) => {
    const url = fotoAtletaOuAvatar(a);
    return url ? carregarImagem(url) : Promise.resolve(null);
  }));
  const fotosB = await Promise.all(atletasB.map((a) => {
    const url = fotoAtletaOuAvatar(a);
    return url ? carregarImagem(url) : Promise.resolve(null);
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

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("Falha ao gerar imagem do card");

  const fileName = `card-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${params.partida.id}.png`;

  let uploadedUrl: string | null = null;
  if (params.salvarNoGcs) {
    const fd = new FormData();
    fd.set("folder", (params.uploadFolder || "cards/partidas").trim());
    try {
      fd.set("file", new File([blob], fileName, { type: "image/png" }));
    } catch {
      fd.set("file", blob, fileName);
    }

    const res = await fetch("/api/upload/image", { method: "POST", body: fd, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(data?.mensagem || data?.error || "Falha ao salvar imagem no GCS");
    const url = String(data?.url || "").trim();
    if (!url) throw new Error("Upload no GCS não retornou URL");
    uploadedUrl = url;

    if (params.persistFotoUrlApi) {
      const resPatch = await fetch(params.persistFotoUrlApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotoUrl: uploadedUrl }),
        cache: "no-store",
      });
      if (!resPatch.ok) {
        const msg = await resPatch.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao salvar URL do card na partida");
      }
    }
  }

  const shouldDownload = params.download !== false;
  if (shouldDownload) {
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  return { url: uploadedUrl };
}

export async function gerarCardProgramacaoAdmin(params: GerarCardProgramacaoParams) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas");

  const template = params.templateUrl ? await carregarImagem(params.templateUrl) : null;
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

  const fotosSincronizadas = await sincronizarFotosPlaynaquadra(params.syncFotosUrl ?? null);
  const atletasA = (params.partida.equipeAAtletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const atletasB = (params.partida.equipeBAtletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const fotosA = await Promise.all(
    atletasA.map((a) => {
      const url = fotoAtletaOuAvatar(a);
      return url ? carregarImagem(url) : Promise.resolve(null);
    })
  );
  const fotosB = await Promise.all(
    atletasB.map((a) => {
      const url = fotoAtletaOuAvatar(a);
      return url ? carregarImagem(url) : Promise.resolve(null);
    })
  );

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

  ctx.fillStyle = "rgba(59,130,246,0.18)";
  const tagX = 70;
  const tagY = 270;
  const tagW = 940;
  const tagH = 64;
  ctx.fillRect(tagX, tagY, tagW, tagH);
  ctx.strokeStyle = "rgba(59,130,246,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(tagX, tagY, tagW, tagH);
  ctx.fillStyle = "#e0f2fe";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 34px Inter, Arial, sans-serif";
  ctx.fillText("PROGRAMAÇÃO", tagX + tagW / 2, tagY + tagH / 2);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const local = params.partida.arenaNome
    ? `${params.partida.arenaNome}${params.partida.quadra ? ` • ${params.partida.quadra}` : ""}`
    : "Arena a definir";
  const faseRodada = (params.partida.rodadaNome || params.partida.fase || "").trim();

  const linhaX = 76;
  const valorX = 320;
  const yCategoria = 378;
  const yData = 448;
  const yArena = 518;
  const yFase = 588;
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 42px Inter, Arial, sans-serif";
  ctx.fillText("Categoria:", linhaX, yCategoria);
  ctx.fillText("Data:", linhaX, yData);
  ctx.fillText("Arena:", linhaX, yArena);
  ctx.fillText("Fase:", linhaX, yFase);
  ctx.font = "700 34px Inter, Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  drawTextLeft(ctx, params.categoriaNome || "A definir", valorX, yCategoria + 10, 650, 40);
  drawTextLeft(ctx, formatarDataHora(params.partida.dataHorario), valorX, yData + 10, 650, 40);
  drawTextLeft(ctx, local, valorX, yArena + 10, 650, 40);
  drawTextLeft(ctx, faseRodada || "-", valorX, yFase + 10, 650, 40);

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

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("Falha ao gerar imagem do card");

  const fileName = `programacao-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${params.partida.id}.png`;

  let uploadedUrl: string | null = null;
  if (params.salvarNoGcs) {
    const fd = new FormData();
    fd.set("folder", (params.uploadFolder || "cards/programacao").trim());
    try {
      fd.set("file", new File([blob], fileName, { type: "image/png" }));
    } catch {
      fd.set("file", blob, fileName);
    }

    const res = await fetch("/api/upload/image", { method: "POST", body: fd, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(data?.mensagem || data?.error || "Falha ao salvar imagem no GCS");
    const url = String(data?.url || "").trim();
    if (!url) throw new Error("Upload no GCS não retornou URL");
    uploadedUrl = url;
  }

  const shouldDownload = params.download !== false;
  if (shouldDownload) {
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  return { url: uploadedUrl };
}

async function gerarCardInscricaoClassico(params: GerarCardInscricaoParams) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas");

  const template = params.templateUrl ? await carregarImagem(params.templateUrl) : null;
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

  const fotosSincronizadas = await sincronizarFotosPlaynaquadra(params.syncFotosUrl ?? null);
  const atletas = (params.inscricao.atletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const fotos = await Promise.all(
    atletas.map((a) => {
      const url = fotoAtletaOuAvatar(a);
      return url ? carregarImagem(url) : Promise.resolve(null);
    })
  );

  const ehTipo2 = params.tipoCardInscricao === "TIPO_2";

  const categoriaAtualNormalizada = normalizeCardText(params.categoriaNome);
  const categoriasProgramacaoOrdenadas = params.ocultarProgramacao || ehTipo2
    ? []
    : (params.categoriasProgramacao ?? [])
        .slice()
        .sort((a, b) => {
          const ta = a.dataHorario ? new Date(a.dataHorario).getTime() : Number.POSITIVE_INFINITY;
          const tb = b.dataHorario ? new Date(b.dataHorario).getTime() : Number.POSITIVE_INFINITY;
          if (ta !== tb) return ta - tb;
          return (a.nome || "").localeCompare(b.nome || "");
        });

  const indiceCategoriaAtual = categoriasProgramacaoOrdenadas.findIndex(
    (categoriaItem) =>
      categoriaItem.id === params.inscricao.categoriaId || normalizeCardText(categoriaItem.nome) === categoriaAtualNormalizada
  );
  const maxRows = Math.min(categoriasProgramacaoOrdenadas.length, 14);
  const programacaoInicio =
    indiceCategoriaAtual >= maxRows && maxRows > 0 ? Math.max(0, indiceCategoriaAtual - (maxRows - 1)) : 0;
  const categoriasProgramacao = categoriasProgramacaoOrdenadas.slice(programacaoInicio, programacaoInicio + maxRows);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#dcfce7";
  ctx.font = ehTipo2 ? "900 56px Inter, Arial, sans-serif" : "900 48px Inter, Arial, sans-serif";
  ctx.fillText("DUPLA CONFIRMADA", width / 2, ehTipo2 ? 560 : 520);

  ctx.fillStyle = "#ffffff";
  ctx.font = ehTipo2 ? "800 44px Inter, Arial, sans-serif" : "800 38px Inter, Arial, sans-serif";
  drawTextCenter(ctx, params.categoriaNome || "Categoria", width / 2, ehTipo2 ? 635 : 580, 840, ehTipo2 ? 50 : 44);

  const tamanhoAvatar = ehTipo2 ? 440 : 330;
  const larguraNome = ehTipo2 ? 470 : 360;
  const tamanhoFonteNome = ehTipo2 ? 30 : 24;
  const espacamentoEntreFotos = ehTipo2 ? 60 : 160;
  const xTotal = tamanhoAvatar * 2 + espacamentoEntreFotos;
  const xInicio = (width - xTotal) / 2;
  const yFotos = ehTipo2 ? 830 : 710;
  const distanciaNomeFoto = ehTipo2 ? 70 : 50;

  const posicoes = [
    { x: xInicio, y: yFotos, atleta: atletas[0], imagem: fotos[0] },
    { x: xInicio + tamanhoAvatar + espacamentoEntreFotos, y: yFotos, atleta: atletas[1], imagem: fotos[1] },
  ];
  for (const p of posicoes) {
    const nome = p.atleta?.nome || "Atleta";
    if (p.imagem) {
      desenharAvatarImagem(ctx, p.imagem, p.x, p.y, tamanhoAvatar);
    } else {
      desenharAvatarFallback(ctx, p.x, p.y, tamanhoAvatar, nome);
    }
  }

  if (!ehTipo2 && categoriasProgramacao.length > 0) {
    const programacaoBoxX = 90;
    const programacaoBoxY = 1110;
    const programacaoBoxW = 900;
    const columnGap = 18;
    const boxPaddingX = 18;
    const rowHeight = 58;
    const titleHeight = 52;
    const contentTopPadding = 10;
    const boxPaddingBottom = 16;
    const usarColunaUnica = categoriasProgramacao.length === 1;
    const rowsPerColumn = usarColunaUnica ? categoriasProgramacao.length : Math.ceil(categoriasProgramacao.length / 2);
    const columnWidth = usarColunaUnica
      ? programacaoBoxW - boxPaddingX * 2
      : (programacaoBoxW - boxPaddingX * 2 - columnGap) / 2;
    const programacaoBoxH = titleHeight + contentTopPadding + rowsPerColumn * rowHeight + boxPaddingBottom;

    ctx.fillStyle = "rgba(15,23,42,0.62)";
    ctx.fillRect(programacaoBoxX, programacaoBoxY, programacaoBoxW, programacaoBoxH);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(programacaoBoxX, programacaoBoxY, programacaoBoxW, programacaoBoxH);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "800 28px Inter, Arial, sans-serif";
    ctx.fillText("PROGRAMACAO DAS CATEGORIAS", width / 2, programacaoBoxY + titleHeight / 2);

    if (!usarColunaUnica) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(programacaoBoxX + programacaoBoxW / 2, programacaoBoxY + titleHeight + 10);
      ctx.lineTo(programacaoBoxX + programacaoBoxW / 2, programacaoBoxY + programacaoBoxH - 12);
      ctx.stroke();
    }

    categoriasProgramacao.forEach((categoriaItem, index) => {
      const columnIndex = usarColunaUnica ? 0 : Math.floor(index / rowsPerColumn);
      const rowIndex = index % rowsPerColumn;
      const x = programacaoBoxX + boxPaddingX + columnIndex * (columnWidth + columnGap);
      const y = programacaoBoxY + titleHeight + contentTopPadding + rowIndex * rowHeight;
      const isCurrent =
        categoriaItem.id === params.inscricao.categoriaId || normalizeCardText(categoriaItem.nome) === categoriaAtualNormalizada;
      const programacao = formatarDataProgramacao(categoriaItem.dataHorario);

      if (isCurrent) {
        ctx.fillStyle = "rgba(249,115,22,0.24)";
        ctx.fillRect(x, y + 2, columnWidth, rowHeight - 8);
        ctx.strokeStyle = "rgba(249,115,22,0.65)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y + 2, columnWidth, rowHeight - 8);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(x, y + 2, columnWidth, rowHeight - 8);
      }

      ctx.textBaseline = "top";
      ctx.fillStyle = isCurrent ? "#ffedd5" : "#f8fafc";
      ctx.font = isCurrent ? "800 18px Inter, Arial, sans-serif" : "700 17px Inter, Arial, sans-serif";
      if (usarColunaUnica) {
        ctx.textAlign = "center";
        drawTextCenter(ctx, categoriaItem.nome || "Categoria", x + columnWidth / 2, y + 8, columnWidth - 28, 22);
      } else {
        ctx.textAlign = "left";
        drawTextLeft(ctx, categoriaItem.nome || "Categoria", x + 14, y + 10, columnWidth - 28, 24);
      }

      ctx.fillStyle = isCurrent ? "#fdba74" : "#cbd5e1";
      ctx.font = isCurrent ? "800 15px Inter, Arial, sans-serif" : "700 15px Inter, Arial, sans-serif";
      if (usarColunaUnica) {
        ctx.textAlign = "center";
        ctx.fillText(`${programacao.data}  ${programacao.hora}`, x + columnWidth / 2, y + 33);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(`${programacao.data}  ${programacao.hora}`, x + 14, y + 33);
      }
    });
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${tamanhoFonteNome}px Inter, Arial, sans-serif`;
  for (const p of posicoes) {
    const nome = nomePrimeiroEUltimo(p.atleta?.nome);
    drawTextCenter(ctx, nome, p.x + tamanhoAvatar / 2, p.y - distanciaNomeFoto, larguraNome, ehTipo2 ? 36 : 28);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("Falha ao gerar imagem do card");

  const fileName = `inscricao-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${params.inscricao.id}.png`;

  let uploadedUrl: string | null = null;
  if (params.salvarNoGcs) {
    const fd = new FormData();
    fd.set("folder", (params.uploadFolder || "cards/inscricoes").trim());
    try {
      fd.set("file", new File([blob], fileName, { type: "image/png" }));
    } catch {
      fd.set("file", blob, fileName);
    }

    const res = await fetch("/api/upload/image", { method: "POST", body: fd, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(data?.mensagem || data?.error || "Falha ao salvar imagem no GCS");
    const url = String(data?.url || "").trim();
    if (!url) throw new Error("Upload no GCS não retornou URL");
    uploadedUrl = url;
  }

  const shouldDownload = params.download !== false;
  if (shouldDownload) {
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  return { url: uploadedUrl };
}

export async function gerarCardProgramacaoTorneioAdmin(params: GerarCardProgramacaoTorneioParams) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas");

  const template = params.templateUrl ? await carregarImagem(params.templateUrl) : null;
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
  overlay.addColorStop(0, "rgba(2,6,23,0.22)");
  overlay.addColorStop(0.55, "rgba(2,6,23,0.10)");
  overlay.addColorStop(1, "rgba(2,6,23,0.28)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  const formatarDiaHora = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  };

  const categorias = (params.categorias ?? [])
    .slice()
    .sort((a, b) => {
      const ta = a.dataHorario ? new Date(a.dataHorario).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.dataHorario ? new Date(b.dataHorario).getTime() : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return (a.nome || "").localeCompare(b.nome || "");
    });

  const leftX = 70;
  const colGap = 30;
  const colW = (width - leftX * 2 - colGap) / 2;
  const yStart = 470;
  const rowH = 76;
  const maxRows = 14;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "800 26px Inter, Arial, sans-serif";

  for (let i = 0; i < Math.min(categorias.length, maxRows * 2); i++) {
    const c = categorias[i];
    const col = i < maxRows ? 0 : 1;
    const row = col === 0 ? i : i - maxRows;
    const x = leftX + col * (colW + colGap);
    const y = yStart + row * rowH;

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, colW, 64);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, colW, 64);

    const dt = formatarDiaHora(c.dataHorario ?? null);
    const nome = (c.nome || "Categoria").trim();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "900 22px Inter, Arial, sans-serif";
    ctx.fillText(dt, x + 16, y + 12);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 28px Inter, Arial, sans-serif";
    drawTextLeft(ctx, nome, x + 16, y + 34, colW - 32, 30);
  }

  if (categorias.length === 0) {
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 32px Inter, Arial, sans-serif";
    ctx.fillText("Nenhuma categoria cadastrada.", width / 2, 650);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("Falha ao gerar imagem do card");

  const fileName = `programacao-${slugify(params.torneioNome)}.png`;

  let uploadedUrl: string | null = null;
  if (params.salvarNoGcs) {
    const fd = new FormData();
    fd.set("folder", (params.uploadFolder || "cards/programacao-torneio").trim());
    try {
      fd.set("file", new File([blob], fileName, { type: "image/png" }));
    } catch {
      fd.set("file", blob, fileName);
    }

    const res = await fetch("/api/upload/image", { method: "POST", body: fd, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(data?.mensagem || data?.error || "Falha ao salvar imagem no GCS");
    const url = String(data?.url || "").trim();
    if (!url) throw new Error("Upload no GCS não retornou URL");
    uploadedUrl = url;
  }

  const shouldDownload = params.download !== false;
  if (shouldDownload) {
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  return { url: uploadedUrl };
}

export async function gerarCardDuplasInscritasAdmin(params: GerarCardDuplasInscritasParams) {
  const width = 1080;
  const height = 1920;
  const template = params.templateUrl ? await carregarImagem(params.templateUrl) : null;
  const duplasOrdenadas = (params.duplas ?? [])
    .slice()
    .map((dupla) => ({ ...dupla, nome: String(dupla.nome || "").trim() || "Dupla" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true }));

  if (duplasOrdenadas.length === 0) {
    throw new Error("Nenhuma dupla inscrita disponível para gerar o card");
  }

  const rowsPerColumn = 12;
  const totalColumns = 2;
  const rowsPerPage = rowsPerColumn * totalColumns;
  const totalPages = Math.max(1, Math.ceil(duplasOrdenadas.length / rowsPerPage));
  const uploadedUrls: string[] = [];

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível inicializar o canvas");

    if (template) {
      ctx.drawImage(template, 0, 0, width, height);
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(0.5, "#1e293b");
      grad.addColorStop(1, "#ea580c");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, "rgba(2,6,23,0.28)");
    overlay.addColorStop(0.45, "rgba(2,6,23,0.18)");
    overlay.addColorStop(1, "rgba(2,6,23,0.34)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 50px Inter, Arial, sans-serif";
    drawTextCenter(ctx, "DUPLAS INSCRITAS", width / 2, 580, 760, 54);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "800 32px Inter, Arial, sans-serif";
    drawTextCenter(ctx, params.categoriaNome || "Categoria", width / 2, 650, 760, 36);

    if (totalPages > 1) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "700 18px Inter, Arial, sans-serif";
      ctx.fillText(`Página ${pageIndex + 1} de ${totalPages}`, width / 2, 706);
    }

    const boxX = 72;
    const boxY = 760;
    const boxW = 936;
    const boxH = 780;
    const boxPaddingX = 26;
    const boxPaddingTop = 28;
    const columnGap = 22;
    const rowHeight = 62;
    const colW = (boxW - boxPaddingX * 2 - columnGap) / 2;

    ctx.fillStyle = "rgba(15,23,42,0.68)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + boxW / 2, boxY + 20);
    ctx.lineTo(boxX + boxW / 2, boxY + boxH - 20);
    ctx.stroke();

    const pageItems = duplasOrdenadas.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    pageItems.forEach((dupla, index) => {
      const columnIndex = Math.floor(index / rowsPerColumn);
      const rowIndex = index % rowsPerColumn;
      const x = boxX + boxPaddingX + columnIndex * (colW + columnGap);
      const y = boxY + boxPaddingTop + rowIndex * rowHeight;
      const numero = pageIndex * rowsPerPage + index + 1;

      ctx.fillStyle = numero % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)";
      ctx.fillRect(x, y, colW, 48);

      ctx.fillStyle = "#fdba74";
      ctx.font = "800 20px Inter, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(numero).padStart(2, "0"), x + 16, y + 24);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 22px Inter, Arial, sans-serif";
      ctx.fillText(fitTextSingleLine(ctx, dupla.nome, colW - 86), x + 70, y + 24);
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) throw new Error("Falha ao gerar imagem do card");

    const fileName =
      totalPages > 1
        ? `inscritos-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${pageIndex + 1}.png`
        : `inscritos-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}.png`;

    let uploadedUrl: string | null = null;
    if (params.salvarNoGcs) {
      const fd = new FormData();
      fd.set("folder", (params.uploadFolder || "cards/inscritos").trim());
      try {
        fd.set("file", new File([blob], fileName, { type: "image/png" }));
      } catch {
        fd.set("file", blob, fileName);
      }

      const res = await fetch("/api/upload/image", { method: "POST", body: fd, cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.mensagem || data?.error || "Falha ao salvar imagem no GCS");
      const url = String(data?.url || "").trim();
      if (!url) throw new Error("Upload no GCS não retornou URL");
      uploadedUrl = url;
      uploadedUrls.push(url);
    }

    const shouldDownload = params.download !== false;
    if (shouldDownload) {
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    }
  }

  return { urls: uploadedUrls };
}

// ---------------------------------------------------------------------------
// Layout "novo" dos cards de jogo e de inscricao (2026-09).
// O layout classico continua acima. Qual usar, em ordem de prioridade:
//   1. localStorage "cardLayout" (teste no navegador atual)
//   2. campo "Modelo dos cards" do torneio (params.layout)
//   3. NEXT_PUBLIC_CARD_LAYOUT=classico (padrao geral)
// O conteudo fica entre MARGEM_TOPO e MARGEM_BASE: acima fica a arte do template,
// abaixo os patrocinadores (que tambem vem no template).
// ---------------------------------------------------------------------------

const CARD_W = 1080;
const CARD_H = 1920;
const MARGEM_TOPO = 600;
const MARGEM_BASE = 1660;
const COR_DESTAQUE = "#35c9e0";
const COR_FUNDO_BLOCO = "rgba(6,18,28,0.74)";

function usarLayoutClassico(layoutTorneio?: string | null) {
  try {
    const local = window.localStorage.getItem("cardLayout");
    if (local) return local.toLowerCase() === "classico";
  } catch {
    // localStorage indisponivel: segue a variavel de ambiente
  }
  if (layoutTorneio) return layoutTorneio.toUpperCase() === "CLASSICO";
  return (process.env.NEXT_PUBLIC_CARD_LAYOUT || "").toLowerCase() === "classico";
}

export async function gerarCardPartidaAdmin(params: GerarCardParams) {
  return usarLayoutClassico(params.layout) ? gerarCardPartidaClassico(params) : gerarCardPartidaNovo(params);
}

export async function gerarCardInscricaoAdmin(params: GerarCardInscricaoParams) {
  return usarLayoutClassico(params.layout) ? gerarCardInscricaoClassico(params) : gerarCardInscricaoNovo(params);
}

type FontesCard = { titulo: string; texto: string };

/** Usa as fontes do admin (Barlow Semi Condensed / Manrope) quando carregadas na pagina. */
async function carregarFontesCard(): Promise<FontesCard> {
  const fallback = "Arial, Helvetica, sans-serif";
  let titulo = fallback;
  let texto = fallback;
  try {
    const el = document.querySelector(".admin-theme") ?? document.body;
    const cs = getComputedStyle(el);
    const barlow = cs.getPropertyValue("--font-barlow").trim();
    const manrope = cs.getPropertyValue("--font-manrope").trim();
    if (barlow) titulo = `${barlow}, ${fallback}`;
    if (manrope) texto = `${manrope}, ${fallback}`;
    await Promise.all([document.fonts.load(`700 40px ${titulo}`), document.fonts.load(`800 40px ${texto}`)]);
  } catch {
    // segue com a fonte padrao
  }
  return { titulo, texto };
}

async function prepararCanvasCard(templateUrl?: string | null) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas");
  const template = templateUrl ? await carregarImagem(templateUrl) : null;
  if (template) {
    ctx.drawImage(template, 0, 0, CARD_W, CARD_H);
  } else {
    ctx.fillStyle = "#06121c";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }
  return { canvas, ctx };
}

function caminhoArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function desenharBloco(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, destaque = false) {
  caminhoArredondado(ctx, x, y, w, h, 28);
  ctx.fillStyle = COR_FUNDO_BLOCO;
  ctx.fill();
  ctx.lineWidth = destaque ? 4 : 2;
  ctx.strokeStyle = destaque ? COR_DESTAQUE : "rgba(255,255,255,0.14)";
  ctx.stroke();
}

/** Avatar do atleta: foto recortada em circulo ou iniciais em negrito, sempre com aro na cor de destaque. */
function desenharAvatarNovo(
  ctx: CanvasRenderingContext2D,
  imagem: HTMLImageElement | null,
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
function textoCabendo(
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

function carregarFotosAtletas(atletas: { nome: string; fotoUrl?: string | null }[]) {
  // sem foto: nada de avatar externo, o gerador desenha as iniciais
  return Promise.all(atletas.map((a) => (a.fotoUrl && a.fotoUrl.trim() ? carregarImagem(a.fotoUrl) : Promise.resolve(null))));
}

async function finalizarCard(
  canvas: HTMLCanvasElement,
  fileName: string,
  opts: { salvarNoGcs?: boolean; uploadFolder?: string | null; pastaPadrao: string; persistFotoUrlApi?: string | null; download?: boolean },
) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("Falha ao gerar imagem do card");

  let uploadedUrl: string | null = null;
  if (opts.salvarNoGcs) {
    const fd = new FormData();
    fd.set("folder", (opts.uploadFolder || opts.pastaPadrao).trim());
    try {
      fd.set("file", new File([blob], fileName, { type: "image/png" }));
    } catch {
      fd.set("file", blob, fileName);
    }
    const res = await fetch("/api/upload/image", { method: "POST", body: fd, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(data?.mensagem || data?.error || "Falha ao salvar imagem no GCS");
    const url = String(data?.url || "").trim();
    if (!url) throw new Error("Upload no GCS não retornou URL");
    uploadedUrl = url;

    if (opts.persistFotoUrlApi) {
      const resPatch = await fetch(opts.persistFotoUrlApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotoUrl: uploadedUrl }),
        cache: "no-store",
      });
      if (!resPatch.ok) {
        const msg = await resPatch.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao salvar URL do card na partida");
      }
    }
  }

  if (opts.download !== false) {
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  return { url: uploadedUrl };
}

const ROTULO_FASE: Record<string, string> = {
  GRUPOS: "Grupos",
  OITAVAS: "Oitavas",
  QUARTAS: "Quartas",
  SEMI: "Semifinal",
  FINAL: "Final",
  TERCEIRO_LUGAR: "3º lugar",
};

async function gerarCardPartidaNovo(params: GerarCardParams) {
  const { canvas, ctx } = await prepararCanvasCard(params.templateUrl);
  const fontes = await carregarFontesCard();
  const partida = params.partida;

  const fotosSincronizadas = await sincronizarFotosPlaynaquadra(params.syncFotosUrl ?? null);
  const comFotoSincronizada = (lista?: { id: string; nome: string; fotoUrl?: string | null }[]) =>
    (lista ?? []).slice(0, 2).map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const atletasA = comFotoSincronizada(partida.equipeAAtletas);
  const atletasB = comFotoSincronizada(partida.equipeBAtletas);
  const [fotosA, fotosB] = await Promise.all([carregarFotosAtletas(atletasA), carregarFotosAtletas(atletasB)]);

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
  const blocos: Array<{ lado: "A" | "B"; atletas: Atleta[]; fotos: (HTMLImageElement | null)[]; nomeEquipe?: string | null; y: number }> = [
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

  const fileName = `card-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${partida.id}.png`;
  return finalizarCard(canvas, fileName, {
    salvarNoGcs: params.salvarNoGcs,
    uploadFolder: params.uploadFolder,
    pastaPadrao: "cards/partidas",
    persistFotoUrlApi: params.persistFotoUrlApi,
    download: params.download,
  });
}

async function gerarCardInscricaoNovo(params: GerarCardInscricaoParams) {
  const { canvas, ctx } = await prepararCanvasCard(params.templateUrl);
  const fontes = await carregarFontesCard();

  const fotosSincronizadas = await sincronizarFotosPlaynaquadra(params.syncFotosUrl ?? null);
  const atletas = (params.inscricao.atletas ?? [])
    .slice(0, 2)
    .map((a) => ({ ...a, fotoUrl: fotosSincronizadas.get(a.id) ?? a.fotoUrl ?? null }));
  const fotos = await carregarFotosAtletas(atletas);
  const ehTipo2 = params.tipoCardInscricao === "TIPO_2";

  // Selo + categoria
  const selo = atletas.length === 1 ? "INSCRIÇÃO CONFIRMADA" : "DUPLA CONFIRMADA";
  ctx.font = `700 46px ${fontes.titulo}`;
  const seloW = ctx.measureText(selo).width + 72;
  const seloH = 72;
  const seloY = MARGEM_TOPO + 20;
  caminhoArredondado(ctx, (CARD_W - seloW) / 2, seloY, seloW, seloH, seloH / 2);
  ctx.fillStyle = COR_DESTAQUE;
  ctx.fill();
  ctx.fillStyle = "#06121c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(selo, CARD_W / 2, seloY + seloH / 2 + 2);

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  ctx.fillText(
    textoCabendo(ctx, params.categoriaNome || "Categoria", (px) => `700 ${px}px ${fontes.titulo}`, 84, 52, CARD_W - 160),
    CARD_W / 2,
    seloY + seloH + 22,
  );

  // Fotos com nome embaixo
  const tamanhoAvatar = ehTipo2 ? 340 : 300;
  const espaco = ehTipo2 ? 60 : 90;
  const qtd = Math.max(1, atletas.length);
  const totalW = qtd * tamanhoAvatar + (qtd - 1) * espaco;
  const fotosY = seloY + seloH + 140;
  let x = (CARD_W - totalW) / 2;
  const larguraNome = tamanhoAvatar + espaco - 10;
  for (let i = 0; i < qtd; i += 1) {
    const atleta = atletas[i] ?? { nome: params.inscricao.equipeNome || "Atleta", fotoUrl: null };
    desenharAvatarNovo(ctx, fotos[i] ?? null, atleta.nome, x, fotosY, tamanhoAvatar, fontes);
    const { primeiroNome, ultimoNome } = separarPrimeiroUltimoNome(atleta.nome || "Atleta");
    const cx = x + tamanhoAvatar / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(textoCabendo(ctx, primeiroNome, (px) => `700 ${px}px ${fontes.titulo}`, 54, 34, larguraNome), cx, fotosY + tamanhoAvatar + 20);
    if (ultimoNome) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(textoCabendo(ctx, ultimoNome, (px) => `700 ${px}px ${fontes.texto}`, 32, 22, larguraNome), cx, fotosY + tamanhoAvatar + 80);
    }
    x += tamanhoAvatar + espaco;
  }

  const y = fotosY + tamanhoAvatar + 150;
  const margemX = 90;
  const larguraUtil = CARD_W - margemX * 2;

  // Programacao das categorias (tipo 1) — limitada ao espaco livre acima dos patrocinadores
  const categoriaAtualNormalizada = normalizeCardText(params.categoriaNome);
  const programacao =
    params.ocultarProgramacao || ehTipo2
      ? []
      : (params.categoriasProgramacao ?? []).slice().sort((a, b) => {
          const ta = a.dataHorario ? new Date(a.dataHorario).getTime() : Number.POSITIVE_INFINITY;
          const tb = b.dataHorario ? new Date(b.dataHorario).getTime() : Number.POSITIVE_INFINITY;
          if (ta !== tb) return ta - tb;
          return (a.nome || "").localeCompare(b.nome || "");
        });

  if (programacao.length > 0) {
    const tituloH = 56;
    const linhaH = 54;
    const colunas = programacao.length === 1 ? 1 : 2;
    const linhasDisponiveis = Math.max(1, Math.floor((MARGEM_BASE - y - tituloH - 20) / linhaH));
    const maxItens = linhasDisponiveis * colunas;
    const idxAtual = programacao.findIndex(
      (c) => c.id === params.inscricao.categoriaId || normalizeCardText(c.nome) === categoriaAtualNormalizada,
    );
    const inicio = idxAtual >= maxItens ? idxAtual - maxItens + 1 : 0;
    const itens = programacao.slice(inicio, inicio + maxItens);
    const linhas = colunas === 1 ? itens.length : Math.ceil(itens.length / colunas);
    const alturaBox = tituloH + linhas * linhaH + 20;
    desenharBloco(ctx, margemX, y, larguraUtil, alturaBox);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `700 30px ${fontes.titulo}`;
    ctx.fillText("PROGRAMAÇÃO DAS CATEGORIAS", CARD_W / 2, y + tituloH / 2 + 4);

    const colunaW = (larguraUtil - 40 - (colunas - 1) * 16) / colunas;
    itens.forEach((cat, index) => {
      const col = colunas === 1 ? 0 : Math.floor(index / linhas);
      const lin = colunas === 1 ? index : index % linhas;
      const cx0 = margemX + 20 + col * (colunaW + 16);
      const cy0 = y + tituloH + lin * linhaH;
      const atual = cat.id === params.inscricao.categoriaId || normalizeCardText(cat.nome) === categoriaAtualNormalizada;
      if (atual) {
        caminhoArredondado(ctx, cx0, cy0 + 4, colunaW, linhaH - 8, 12);
        ctx.fillStyle = "rgba(53,201,224,0.22)";
        ctx.fill();
      }
      const quando = formatarDataProgramacao(cat.dataHorario);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = atual ? "#ffffff" : "rgba(255,255,255,0.88)";
      ctx.fillText(
        textoCabendo(ctx, cat.nome || "Categoria", (px) => `800 ${px}px ${fontes.texto}`, 22, 16, colunaW - 150),
        cx0 + 14,
        cy0 + linhaH / 2,
      );
      ctx.textAlign = "right";
      ctx.fillStyle = atual ? COR_DESTAQUE : "rgba(255,255,255,0.65)";
      ctx.font = `700 20px ${fontes.texto}`;
      ctx.fillText(`${quando.data} ${quando.hora}`, cx0 + colunaW - 14, cy0 + linhaH / 2);
    });
  } else if (params.inscricao.categoriaDataHorario) {
    const quando = formatarDataProgramacao(params.inscricao.categoriaDataHorario);
    const alturaBox = 96;
    if (y + alturaBox <= MARGEM_BASE) {
      desenharBloco(ctx, margemX, y, larguraUtil, alturaBox);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 36px ${fontes.texto}`;
      ctx.fillText(`Jogos da categoria: ${quando.data} às ${quando.hora}`, CARD_W / 2, y + alturaBox / 2);
    }
  }

  const fileName = `inscricao-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${params.inscricao.id}.png`;
  return finalizarCard(canvas, fileName, {
    salvarNoGcs: params.salvarNoGcs,
    uploadFolder: params.uploadFolder,
    pastaPadrao: "cards/inscricoes",
    download: params.download,
  });
}
