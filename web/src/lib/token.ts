import crypto from "crypto";

export function gerarTokenAleatorio(bytes = 32) {
  const buf = crypto.randomBytes(bytes);
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

