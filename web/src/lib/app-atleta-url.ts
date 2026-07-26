const DEFAULT_APP_ATLETA_URL = "https://atleta.playnaquadra.com.br";

export function getAppAtletaUrl() {
  const raw = process.env.NEXT_PUBLIC_APPATLETA_URL || process.env.APPATLETA_URL || DEFAULT_APP_ATLETA_URL;
  return String(raw || DEFAULT_APP_ATLETA_URL).trim().replace(/\/+$/, "") || DEFAULT_APP_ATLETA_URL;
}
