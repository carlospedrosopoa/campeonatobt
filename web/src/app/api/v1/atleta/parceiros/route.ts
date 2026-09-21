import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { playBuscarAtletas } from "@/services/playnaquadra-client";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { and, eq, or, sql } from "drizzle-orm";

type PlayCandidate = {
  id: string;
  playnaquadraAtletaId: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  fotoUrl: string | null;
  genero: "MASCULINO" | "FEMININO" | null;
};

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeGeneroInline(value: unknown): "MASCULINO" | "FEMININO" | null {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (["m", "masculino", "male", "homem"].includes(normalized)) return "MASCULINO";
  if (["f", "feminino", "female", "mulher"].includes(normalized)) return "FEMININO";
  return null;
}

function cleanBaseUrl(raw: string) {
  let base = (raw || "").trim();
  if (base.endsWith("/")) base = base.slice(0, -1);
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

async function carlaoBtOnlineBuscarGenero(params: { email?: string | null; telefone?: string | null; nome?: string | null }): Promise<"MASCULINO" | "FEMININO" | null> {
  const base = cleanBaseUrl(process.env.CARLAOBTONLINE_API_URL || process.env.NEXT_PUBLIC_CARLAOBTONLINE_API_URL || "");
  const secret = (process.env.CAMPEONATOBT_INTEGRATION_TOKEN || process.env.INTEGRATION_CARLAOBTONLINE_TOKEN || "").trim();
  const email = normalizeEmail(params.email);
  const phone = normalizePhone(params.telefone);
  const nome = String(params.nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!base || !secret) return null;
  if (!email && !phone && !nome) return null;

  const headers = {
    Authorization: `Bearer ${secret}`,
    "x-integration-token": secret,
  };

  async function search(query: string) {
    try {
      const url = `${base}/api/atleta/para-selecao?busca=${encodeURIComponent(query)}`;
      const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
      if (!res.ok) return [] as any[];
      const data = await res.json().catch(() => null) as any;
      return Array.isArray(data) ? data : Array.isArray(data?.atletas) ? data.atletas : [];
    } catch {
      return [] as any[];
    }
  }

  function matchGenero(list: any[], match: (item: any) => boolean): "MASCULINO" | "FEMININO" | null {
    const item = list.find(match);
    return normalizeGeneroInline(item?.genero);
  }

  try {
    if (email) {
      const list = await search(email);
      const g = matchGenero(list, (item) => normalizeEmail(item.email) === email);
      if (g) return g;
    }
    if (phone) {
      const list = await search(phone.slice(-8));
      const g = matchGenero(list, (item) => {
        const ip = normalizePhone(item.telefone || item.whatsapp || item.fone);
        return Boolean((ip && phone && ip === phone) || (ip && phone && ip.endsWith(phone.slice(-8))));
      });
      if (g) return g;
    }
    if (nome) {
      const list = await search(nome);
      const ranked = list
        .map((item: any) => ({
          item,
          norm: String(item.nome || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " "),
        }))
        .filter((x: { norm: string }) => Boolean(x.norm))
        .map((x: { norm: string; item: any }) => ({
          ...x,
          score: x.norm === nome ? 100 : nome && x.norm && (x.norm.includes(nome) || nome.includes(x.norm)) ? 40 : 0,
        }))
        .filter((x: { score: number }) => x.score >= 40)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      const g = normalizeGeneroInline(ranked[0]?.item?.genero);
      if (g) return g;
    }
  } catch (err) {
    // best-effort, ignora
  }
  return null;
}

function extractPlayCandidate(item: unknown): PlayCandidate | null {
  const source = item && typeof item === "object" ? (item as Record<string, any>) : null;
  if (!source) return null;

  const playnaquadraAtletaId =
    String(source.id || source._id || source.atletaId || source.usuarioId || "").trim() || null;
  const usuario = source.usuario && typeof source.usuario === "object" ? (source.usuario as Record<string, any>) : null;
  const atleta = source.atleta && typeof source.atleta === "object" ? (source.atleta as Record<string, any>) : null;
  const user = source.user && typeof source.user === "object" ? (source.user as Record<string, any>) : null;
  const profile = source.profile && typeof source.profile === "object" ? (source.profile as Record<string, any>) : null;
  const data = source.data && typeof source.data === "object" ? (source.data as Record<string, any>) : null;

  const nome = String(source.nome || usuario?.nome || atleta?.nome || user?.nome || profile?.nome || data?.nome || "").trim();
  const email = normalizeEmail(source.email || usuario?.email || atleta?.email || user?.email || profile?.email || data?.email || "");
  const telefone = String(source.telefone || source.whatsapp || usuario?.telefone || usuario?.whatsapp || atleta?.telefone || atleta?.whatsapp || user?.telefone || profile?.telefone || data?.telefone || "").trim() || null;
  const fotoUrl = String(source.fotoUrl || source.foto_url || source.foto || usuario?.fotoUrl || usuario?.foto_url || atleta?.fotoUrl || atleta?.foto_url || user?.fotoUrl || profile?.fotoUrl || data?.fotoUrl || "").trim() || null;
  const genero = normalizeGeneroInline(
    source.genero ||
      source.sexo ||
      source.gender ||
      usuario?.genero ||
      usuario?.sexo ||
      atleta?.genero ||
      atleta?.sexo ||
      user?.genero ||
      user?.sexo ||
      profile?.genero ||
      profile?.sexo ||
      data?.genero ||
      data?.sexo
  );

  if (!playnaquadraAtletaId && !nome && !email) return null;

  return {
    id: playnaquadraAtletaId || "",
    playnaquadraAtletaId,
    nome: nome || email || "Atleta",
    email,
    telefone,
    fotoUrl,
    genero,
  };
}

function hasResolvedPlayProfile(item: PlayCandidate | null): item is PlayCandidate {
  return Boolean(item?.playnaquadraAtletaId);
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const limiteRaw = request.nextUrl.searchParams.get("limite")?.trim() || "";
  const limite = Math.min(50, Math.max(5, Number(limiteRaw || 20) || 20));

  if (q.length < 2) return NextResponse.json({ atletas: [], total: 0 }, { headers: { "Cache-Control": "no-store" } });

  try {
    const tokenPlay = request.cookies.get("play_token")?.value || "";
    const tokenBusca = tokenPlay || (await getPlayAdminToken());
    const result = await playBuscarAtletas({ token: tokenBusca, q, limite });
    if (tokenPlay && result.res.status === 401) {
      const response = NextResponse.json(
        { error: "Sessão do Play na Quadra expirada. Faça login novamente." },
        { status: 401 }
      );
      response.cookies.set("play_token", "", { expires: new Date(0), path: "/" });
      return response;
    }
    if (result.res.ok) {
      const rawCandidates: unknown[] = Array.isArray(result.data?.atletas) ? result.data.atletas : Array.isArray(result.data) ? result.data : [];
      let atletas = rawCandidates.map(extractPlayCandidate).filter(hasResolvedPlayProfile);

      // Best-effort: preenche genero null com carlaobtonline
      atletas = await Promise.all(
        atletas.map(async (cand) => {
          if (cand.genero) return cand;
          const g = await carlaoBtOnlineBuscarGenero({ email: cand.email, telefone: cand.telefone, nome: cand.nome });
          return g ? { ...cand, genero: g } : cand;
        })
      );

      return NextResponse.json(
        { atletas, total: atletas.length },
        { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
      );
    }

    const term = `%${q.toLowerCase()}%`;
    const qDigits = q.replace(/\D/g, "");
    const where = and(
      eq(usuarios.perfil, "ATLETA"),
      sql`${usuarios.playnaquadraAtletaId} is not null`,
      or(
        sql`lower(${usuarios.nome}) like ${term}`,
        sql`lower(${usuarios.email}) like ${term}`,
        ...(qDigits.length >= 2 ? [sql`regexp_replace(coalesce(${usuarios.telefone}, ''), '\\D', '', 'g') like ${`%${qDigits}%`}`] : [])
      )
    );

    const rows = await db
      .select({
        id: usuarios.playnaquadraAtletaId,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        fotoUrl: usuarios.fotoUrl,
      })
      .from(usuarios)
      .where(where)
      .limit(limite);

    let atletas: PlayCandidate[] = rows.map((r) => ({
      id: (r.playnaquadraAtletaId as string | null) || "",
      playnaquadraAtletaId: r.playnaquadraAtletaId as string | null,
      nome: r.nome,
      email: r.email,
      telefone: r.telefone,
      fotoUrl: r.fotoUrl,
      genero: null,
    }));

    atletas = await Promise.all(
      atletas.map(async (cand) => {
        if (cand.genero) return cand;
        const g = await carlaoBtOnlineBuscarGenero({ email: cand.email, telefone: cand.telefone, nome: cand.nome });
        return g ? { ...cand, genero: g } : cand;
      })
    );

    return NextResponse.json({ atletas, total: atletas.length }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao buscar atletas" }, { status: 500 });
  }
}
