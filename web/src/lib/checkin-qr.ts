import { createHmac, timingSafeEqual } from "crypto";

/**
 * Codigo do QR de check-in: muda todo dia e nao precisa de banco.
 * HMAC(torneio + dia) com o segredo do servidor — a foto do QR de ontem nao vale hoje.
 */
function segredo() {
  const s = process.env.JWT_SECRET || process.env.CHECKIN_QR_SECRET;
  if (!s) throw new Error("JWT_SECRET não configurado");
  return s;
}

export function gerarTokenCheckin(torneioId: string, data: string) {
  return createHmac("sha256", segredo()).update(`checkin:${torneioId}:${data}`).digest("base64url").slice(0, 22);
}

export function validarTokenCheckin(torneioId: string, data: string, token: string) {
  const esperado = Buffer.from(gerarTokenCheckin(torneioId, data));
  const recebido = Buffer.from(String(token || "").trim());
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}
