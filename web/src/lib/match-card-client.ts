"use client";

import {
  CARD_W,
  CARD_H,
  MARGEM_BASE,
  MARGEM_TOPO,
  COR_DESTAQUE,
  ROTULO_FASE,
  caminhoArredondado,
  carregarFotosAtletas as carregarFotosAtletasCom,
  desenharAvatarFallback,
  desenharAvatarImagem,
  desenharAvatarNovo,
  desenharBloco,
  desenharCardPartidaClassico,
  desenharCardPartidaNovo,
  desenharTextoSimples,
  drawTextCenter,
  drawTextLeft,
  fitTextSingleLine,
  fotoAtletaOuAvatar,
  formatarDataHora,
  formatarDataProgramacao,
  formatarPlacarPartida,
  iniciaisNome,
  layoutClassicoDoTorneio,
  nomePrimeiroEUltimo,
  normalizeCardText,
  separarPrimeiroUltimoNome,
  textoCabendo,
  type FontesCard,
  type PartidaCardInfo,
} from "@/lib/match-card-desenho";

function carregarFotosAtletas(atletas: { nome: string; fotoUrl?: string | null }[]) {
  return carregarFotosAtletasCom(atletas, carregarImagem);
}

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

async function gerarCardPartidaClassico(params: GerarCardParams) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas");
  const fotosSincronizadas = await sincronizarFotosPlaynaquadra(params.syncFotosUrl ?? null);
  await desenharCardPartidaClassico(ctx, params, { carregarImagem, fotosSincronizadas, fontes: { titulo: "Arial", texto: "Arial" } });
  const fileName = `card-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${params.partida.id}.png`;
  return finalizarCard(canvas, fileName, {
    salvarNoGcs: params.salvarNoGcs,
    uploadFolder: params.uploadFolder,
    pastaPadrao: "cards/partidas",
    persistFotoUrlApi: params.persistFotoUrlApi,
    download: params.download,
  });
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
//   3. NEXT_PUBLIC_CARD_LAYOUT=novo (padrao geral; sem nada, usa o classico)
// O conteudo fica entre MARGEM_TOPO e MARGEM_BASE: acima fica a arte do template,
// abaixo os patrocinadores (que tambem vem no template).
// ---------------------------------------------------------------------------

function usarLayoutClassico(layoutTorneio?: string | null) {
  try {
    const local = window.localStorage.getItem("cardLayout");
    if (local) return local.toLowerCase() === "classico";
  } catch {
    // localStorage indisponivel: segue a variavel de ambiente
  }
  return layoutClassicoDoTorneio(layoutTorneio);
}

export async function gerarCardPartidaAdmin(params: GerarCardParams) {
  return usarLayoutClassico(params.layout) ? gerarCardPartidaClassico(params) : gerarCardPartidaNovo(params);
}

export async function gerarCardInscricaoAdmin(params: GerarCardInscricaoParams) {
  return usarLayoutClassico(params.layout) ? gerarCardInscricaoClassico(params) : gerarCardInscricaoNovo(params);
}

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

async function gerarCardPartidaNovo(params: GerarCardParams) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas");
  const [fontes, fotosSincronizadas] = await Promise.all([
    carregarFontesCard(),
    sincronizarFotosPlaynaquadra(params.syncFotosUrl ?? null),
  ]);
  await desenharCardPartidaNovo(ctx, params, { carregarImagem, fotosSincronizadas, fontes });
  const fileName = `card-${slugify(params.torneioNome)}-${slugify(params.categoriaNome)}-${params.partida.id}.png`;
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
