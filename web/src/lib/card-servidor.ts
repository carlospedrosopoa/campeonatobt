import path from "node:path";
import { readFileSync } from "node:fs";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import {
  CARD_H,
  CARD_W,
  desenharCardPartidaClassico,
  desenharCardPartidaNovo,
  layoutClassicoDoTorneio,
  type AmbienteCard,
  type DadosCardPartida,
  type ImagemCard,
} from "@/lib/match-card-desenho";

// Desenha o card de jogo no servidor com as mesmas funcoes do admin (match-card-desenho.ts).
// O servidor nao tem as fontes do sistema nem as do admin: registra as mesmas via @fontsource
// (os arquivos vao junto da rota pelo outputFileTracingIncludes do next.config).

const FONTES = [
  ["barlow-semi-condensed", "barlow-semi-condensed-latin-700-normal.woff2", "Barlow Semi Condensed"],
  ["barlow-semi-condensed", "barlow-semi-condensed-latin-700-italic.woff2", "Barlow Semi Condensed"],
  ["manrope", "manrope-latin-800-normal.woff2", "Manrope"],
  ["inter", "inter-latin-500-normal.woff2", "Inter"],
  ["inter", "inter-latin-700-normal.woff2", "Inter"],
  ["inter", "inter-latin-900-normal.woff2", "Inter"],
] as const;

let fontesRegistradas = false;

function registrarFontes() {
  if (fontesRegistradas) return;
  for (const [pacote, arquivo, familia] of FONTES) {
    try {
      const caminho = path.join(process.cwd(), "node_modules", "@fontsource", pacote, "files", arquivo);
      GlobalFonts.register(readFileSync(caminho), familia);
    } catch (e) {
      console.error("Fonte do card nao carregada:", arquivo, e);
    }
  }
  fontesRegistradas = true;
}

async function carregarImagemServidor(url: string): Promise<ImagemCard | null> {
  try {
    const limpa = (url || "").replace(/[`'"\s]/g, "");
    if (!/^https?:\/\//i.test(limpa)) return null;
    const res = await fetch(limpa, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const imagem = await loadImage(Buffer.from(await res.arrayBuffer()));
    return imagem as unknown as ImagemCard;
  } catch {
    return null;
  }
}

/** PNG do card de jogo, no modelo escolhido no torneio (NOVO | CLASSICO). */
export async function gerarCardPartidaPng(dados: DadosCardPartida & { layout?: string | null }) {
  registrarFontes();
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const amb: AmbienteCard = {
    carregarImagem: carregarImagemServidor,
    fotosSincronizadas: new Map(),
    fontes: { titulo: '"Barlow Semi Condensed", Inter, sans-serif', texto: "Manrope, Inter, sans-serif" },
  };
  if (layoutClassicoDoTorneio(dados.layout)) await desenharCardPartidaClassico(ctx, dados, amb);
  else await desenharCardPartidaNovo(ctx, dados, amb);
  return canvas.encode("png");
}
