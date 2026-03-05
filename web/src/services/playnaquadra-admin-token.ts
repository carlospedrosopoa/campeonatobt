import { playLogin } from "@/services/playnaquadra-client";

let cachedToken: string | null = null;
let cachedExpMs: number | null = null;

function decodeJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    const payload = JSON.parse(json);
    const exp = payload?.exp;
    if (!exp) return null;
    return Number(exp) * 1000;
  } catch {
    return null;
  }
}

export async function getPlayAdminToken() {
  const now = Date.now();
  if (cachedToken && cachedExpMs && cachedExpMs - now > 60_000) return cachedToken;

  const email = process.env.PLAYNAQUADRA_ADMIN_EMAIL || "";
  const password = process.env.PLAYNAQUADRA_ADMIN_PASSWORD || "";
  if (!email || !password) throw new Error("Credenciais do Play na Quadra não configuradas");

  const login = await playLogin(email, password);
  const token = (login.data?.token as string | undefined) ?? "";
  if (!login.res.ok || !token) throw new Error("Falha ao autenticar no Play na Quadra");

  cachedToken = token;
  cachedExpMs = decodeJwtExpMs(token) ?? null;
  return token;
}

export function clearPlayAdminToken() {
  cachedToken = null;
  cachedExpMs = null;
}

