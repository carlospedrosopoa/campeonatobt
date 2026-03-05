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

async function playFetch(path: string, init: RequestInit & { token?: string } = {}) {
  const base = getBaseUrl();
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

export async function playLogin(email: string, password: string) {
  const res = await playFetch("/user/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const data = (await res.json().catch(() => null)) as PlayLoginResponse | null;
  return { res, data };
}

export async function playGetUsuarioLogado(token: string) {
  const res = await playFetch("/user/getUsuarioLogado", { method: "GET", token });
  const data = (await res.json().catch(() => null)) as any;
  return { res, data };
}

export async function playGetAtletaMe(token: string) {
  const res = await playFetch("/atleta/me/atleta", { method: "GET", token });
  if (res.status === 204) return { res, data: null };
  const data = (await res.json().catch(() => null)) as any;
  return { res, data };
}

export async function playBuscarAtletas(params: { token: string; q: string; limite?: number }) {
  const query = new URLSearchParams();
  query.set("q", params.q);
  query.set("limite", String(params.limite ?? 20));
  const res = await playFetch(`/user/atleta/buscar?${query.toString()}`, { method: "GET", token: params.token });
  const data = (await res.json().catch(() => null)) as any;
  return { res, data };
}

