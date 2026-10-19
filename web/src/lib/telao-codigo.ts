import { createHmac, timingSafeEqual } from "crypto";

/**
 * Codigo do telao sem login (Smart Torneio): quem tem o link abre o telao no aparelho da caixa de som.
 * HMAC(torneio) com o segredo do servidor: nao precisa de banco e e diferente do codigo de inscricao.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function segredo() {
  const s = process.env.JWT_SECRET || process.env.CHECKIN_QR_SECRET;
  if (!s) throw new Error("JWT_SECRET não configurado");
  return s;
}

export function codigoTelao(torneioId: string) {
  const bytes = createHmac("sha256", segredo()).update(`telao:${torneioId}`).digest();
  return Array.from(bytes.subarray(0, 8), (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export function validarCodigoTelao(torneioId: string, codigo: string | null | undefined) {
  const esperado = Buffer.from(codigoTelao(torneioId));
  const recebido = Buffer.from(String(codigo || "").trim().toUpperCase());
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

export function caminhoTelao(slug: string, torneioId: string) {
  return `/torneios/${slug}/telao?c=${codigoTelao(torneioId)}`;
}
