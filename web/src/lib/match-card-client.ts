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
  templateUrl?: string | null;
  syncFotosUrl?: string | null;
  partida: PartidaCardInfo;
};

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

function formatarDataHora(value?: string | null) {
  if (!value) return "Data a definir";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Data a definir";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export async function gerarCardPartidaAdmin(params: GerarCardParams) {
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
  const tamanhoAvatar = 255;
  const ajusteNomesY = 50;
  const larguraNome = 250;
  const posicoes = [
    { x: 55, y: 755, atleta: atletasA[0], imagem: fotosA[0] },
    { x: 510, y: 635, atleta: atletasA[1], imagem: fotosA[1] },
    { x: 90, y: 1320, atleta: atletasB[0], imagem: fotosB[0] },
    { x: 550, y: 1200, atleta: atletasB[1], imagem: fotosB[1] },
  ];
  for (const p of posicoes) {
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
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 22px Inter, Arial, sans-serif";
  for (const p of posicoes) {
    const nome = p.atleta?.nome || "Atleta";
    drawTextCenter(ctx, nome, p.x + tamanhoAvatar / 2, p.y + tamanhoAvatar + ajusteNomesY, larguraNome, 28);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("Falha ao gerar imagem do card");

  const downloadUrl = URL.createObjectURL(blob);
  const fileName = `card-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${params.partida.id}.png`;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
