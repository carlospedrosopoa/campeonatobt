export type PlayLoginResponse = {
  token?: string;
  usuario?: any;
  user?: any;
  mensagem?: string;
  error?: string;
};

function getBaseUrl() {
  const raw = process.env.PLAYNAQUADRA_API_URL || "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function getAtletaBaseUrl() {
  const raw = process.env.PLAYNAQUADRA_ATLETA_API_URL || "";
  const configured = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  if (configured) return configured;
  const base = getBaseUrl();
  if (!base) return "";
  return base.replace(/:\/\/(www\.)?playnaquadra\.com\.br\/api/i, "://atleta.playnaquadra.com.br/api");
}

async function playFetchWithBase(base: string, path: string, init: RequestInit & { token?: string } = {}) {
  if (!base) throw new Error("PLAYNAQUADRA_API_URL não configurada");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as any),
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const { token: _token, ...rest } = init as any;
  return fetch(url, { ...rest, headers, cache: "no-store" });
}

function isAtletaAreaRequiredMessage(data: any) {
  const msg = String(data?.mensagem || data?.message || data?.error || "").toLowerCase();
  return msg.includes("atletas devem usar") || msg.includes("aplicativo do atleta");
}

async function playFetchSmartJson(path: string, init: RequestInit & { token?: string } = {}) {
  const base = getBaseUrl();
  const res1 = await playFetchWithBase(base, path, init);
  if (res1.status === 204) return { res: res1, data: null as any };
  const data1 = (await res1.json().catch(() => null)) as any;
  if (res1.status === 403 && isAtletaAreaRequiredMessage(data1)) {
    const atletaBase = getAtletaBaseUrl();
    const res2 = await playFetchWithBase(atletaBase, path, init);
    if (res2.status === 204) return { res: res2, data: null as any };
    const data2 = (await res2.json().catch(() => null)) as any;
    return { res: res2, data: data2 };
  }
  return { res: res1, data: data1 };
}

export async function playLogin(email: string, password: string) {
  const { res, data } = await playFetchSmartJson("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  return { res, data: (data as PlayLoginResponse | null) ?? null };
}

export async function playGetUsuarioLogado(token: string) {
  const { res, data } = await playFetchSmartJson("/user/getUsuarioLogado", { method: "GET", token });
  return { res, data };
}

export async function playGetAtletaMe(token: string) {
  const { res, data } = await playFetchSmartJson("/atleta/me/atleta", { method: "GET", token });
  return { res, data };
}

export async function playBuscarAtletas(params: { token: string; q: string; limite?: number }) {
  const query = new URLSearchParams();
  query.set("q", params.q);
  query.set("limite", String(params.limite ?? 20));
  const { res, data } = await playFetchSmartJson(`/user/atleta/buscar?${query.toString()}`, { method: "GET", token: params.token });
  return { res, data };
}

export async function playListarPoints(params: { token: string; apenasAtivos?: boolean }) {
  const query = new URLSearchParams();
  if (params.apenasAtivos) query.set("apenasAtivos", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const base = getBaseUrl();
  const res = await playFetchWithBase(base, `/point${suffix}`, { method: "GET", token: params.token });
  const data = (await res.json().catch(() => null)) as any;
  return { res, data };
}

export async function playGetAtletaById(params: { token: string; atletaId: string }) {
  const base = getBaseUrl();
  const res = await playFetchWithBase(base, `/atleta/${encodeURIComponent(params.atletaId)}`, { method: "GET", token: params.token });
  const data = (await res.json().catch(() => null)) as any;
  return { res, data };
}

