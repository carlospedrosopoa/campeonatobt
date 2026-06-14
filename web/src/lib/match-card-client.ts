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
  categoriaNome: string;
  templateUrl?: string | null;
  syncFotosUrl?: string | null;
  salvarNoGcs?: boolean;
  uploadFolder?: string | null;
  download?: boolean;
  ocultarProgramacao?: boolean;
  categoriasProgramacao?: ProgramacaoCategoriaInfo[];
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
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 22px Inter, Arial, sans-serif";
  for (const p of posicoes) {
    const nome = p.atleta?.nome || "Atleta";
    drawTextCenter(ctx, nome, p.x + tamanhoAvatar / 2, p.y + tamanhoAvatar + ajusteNomesY, larguraNome, 28);
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

export async function gerarCardInscricaoAdmin(params: GerarCardInscricaoParams) {
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

  const categoriaAtualNormalizada = normalizeCardText(params.categoriaNome);
  const categoriasProgramacaoOrdenadas = params.ocultarProgramacao
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

  const tamanhoAvatar = 330;
  const larguraNome = 360;
  const ajusteNomesY = 42;
  const posicoes = [
    { x: 130, y: 710, atleta: atletas[0], imagem: fotos[0] },
    { x: 620, y: 710, atleta: atletas[1], imagem: fotos[1] },
  ];
  for (const p of posicoes) {
    const nome = p.atleta?.nome || "Atleta";
    if (p.imagem) {
      desenharAvatarImagem(ctx, p.imagem, p.x, p.y, tamanhoAvatar);
    } else {
      desenharAvatarFallback(ctx, p.x, p.y, tamanhoAvatar, nome);
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#dcfce7";
  ctx.font = "900 48px Inter, Arial, sans-serif";
  ctx.fillText("DUPLA CONFIRMADA", width / 2, 520);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 38px Inter, Arial, sans-serif";
  drawTextCenter(ctx, params.categoriaNome || "Categoria", width / 2, 580, 840, 44);

  const programacaoBoxX = 90;
  const programacaoBoxY = 1110;
  const programacaoBoxW = 900;
  const columnGap = 18;
  const boxPaddingX = 18;
  const rowHeight = 58;
  const titleHeight = 52;
  const contentTopPadding = 10;
  const boxPaddingBottom = 16;
  const rowsPerColumn = Math.ceil(categoriasProgramacao.length / 2);
  const columnWidth = (programacaoBoxW - boxPaddingX * 2 - columnGap) / 2;
  const programacaoBoxH = titleHeight + contentTopPadding + rowsPerColumn * rowHeight + boxPaddingBottom;

  if (categoriasProgramacao.length > 0) {
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

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(programacaoBoxX + programacaoBoxW / 2, programacaoBoxY + titleHeight + 10);
    ctx.lineTo(programacaoBoxX + programacaoBoxW / 2, programacaoBoxY + programacaoBoxH - 12);
    ctx.stroke();

    categoriasProgramacao.forEach((categoriaItem, index) => {
      const columnIndex = Math.floor(index / rowsPerColumn);
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

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = isCurrent ? "#ffedd5" : "#f8fafc";
      ctx.font = isCurrent ? "800 18px Inter, Arial, sans-serif" : "700 17px Inter, Arial, sans-serif";
      drawTextLeft(ctx, categoriaItem.nome || "Categoria", x + 14, y + 10, columnWidth - 28, 24);

      ctx.textAlign = "left";
      ctx.fillStyle = isCurrent ? "#fdba74" : "#cbd5e1";
      ctx.font = isCurrent ? "800 15px Inter, Arial, sans-serif" : "700 15px Inter, Arial, sans-serif";
      ctx.fillText(`${programacao.data}  ${programacao.hora}`, x + 14, y + 33);
    });
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px Inter, Arial, sans-serif";
  for (const p of posicoes) {
    const nome = p.atleta?.nome || "Atleta";
    drawTextCenter(ctx, nome, p.x + tamanhoAvatar / 2, p.y - 50, larguraNome, 28);
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

  ctx.fillStyle = "rgba(249,115,22,0.18)";
  const tagX = 70;
  const tagY = 230;
  const tagW = 940;
  const tagH = 72;
  ctx.fillRect(tagX, tagY, tagW, tagH);
  ctx.strokeStyle = "rgba(249,115,22,0.60)";
  ctx.lineWidth = 2;
  ctx.strokeRect(tagX, tagY, tagW, tagH);
  ctx.fillStyle = "#ffedd5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 36px Inter, Arial, sans-serif";
  ctx.fillText("PROGRAMAÇÃO", tagX + tagW / 2, tagY + tagH / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 54px Inter, Arial, sans-serif";
  drawTextCenter(ctx, (params.torneioNome || "Torneio").trim(), width / 2, 330, 980, 62);

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
