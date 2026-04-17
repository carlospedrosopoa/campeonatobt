import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { arenas, categorias, equipeIntegrantes, partidas, usuarios, torneios } from "@/db/schema";
import { and, asc, eq, inArray, gte, lte, sql } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playBuscarAtletas, playGetAtletaById } from "@/services/playnaquadra-client";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

type SyncResult = {
  totalAtletas: number;
  totalComPlayId: number;
  atualizados: number;
  consultados: number;
  jaAtualizados: number;
  semFotoNoPlay: number;
  falhasConsulta: number;
};

type SyncOneResult =
  | { ok: true; usuarioId: string; consultado: boolean; atualizado: boolean; fotoUrl: string | null }
  | { ok: false; usuarioId: string; error: string; debug?: any };

function extrairFotoUrl(payload: any): string | null {
  const baseRaw = process.env.PLAYNAQUADRA_API_URL || "";
  const base = baseRaw.endsWith("/") ? baseRaw.slice(0, -1) : baseRaw;

  const sanitize = (value: string) => value.replace(/[`'"\s]/g, "").trim();

  const looksLikeUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const isPlayApiUuidUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.hostname.includes("playnaquadra.com.br") && /^\/api\/[0-9a-f-]{36}$/i.test(u.pathname);
    } catch {
      return false;
    }
  };

  const isLikelyAthletePhotoUrl = (value: string) => {
    if (value.startsWith("data:image/")) return true;
    try {
      const u = new URL(value);
      const path = (u.pathname || "").toLowerCase();
      if (path.includes("/campeonatos/") || path.includes("/banners/") || path.includes("/arenas/") || path.includes("/arena/") || path.includes("/points/") || path.includes("/point/")) {
        return false;
      }
      if (u.hostname.includes("storage.googleapis.com")) {
        return path.includes("/atletas/") || path.includes("/atleta/");
      }
      if (u.hostname.includes("playnaquadra.com.br")) {
        return path.includes("atleta") || path.includes("profile") || path.includes("avatar") || path.includes("foto");
      }
      return true;
    } catch {
      return false;
    }
  };

  const base64Mime = (raw: string) => {
    const s = raw.trim();
    if (s.startsWith("/9j/")) return "image/jpeg";
    if (s.startsWith("iVBORw0KGgo")) return "image/png";
    if (s.startsWith("R0lGODdh") || s.startsWith("R0lGODlh")) return "image/gif";
    if (s.startsWith("UklGR")) return "image/webp";
    return "image/jpeg";
  };

  const looksLikeBase64 = (raw: string) => {
    const s = raw.trim();
    if (s.length < 200) return false;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(s)) return false;
    return true;
  };

  const normalizeUrl = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === "string") {
      const v = sanitize(value);
      if (!v) return null;
      if (v.startsWith("data:image/")) return v;
      if (looksLikeBase64(v)) return `data:${base64Mime(v)};base64,${v.replaceAll(/\s+/g, "")}`;
      try {
        const u = new URL(v);
        if (!["http:", "https:", "data:"].includes(u.protocol)) return null;
        const url = u.toString();
        if (isPlayApiUuidUrl(url)) return null;
        if (!isLikelyAthletePhotoUrl(url)) return null;
        return url;
      } catch {
        if (looksLikeUuid(v)) return null;
        if (v.startsWith("/") && base) return `${base}${v}`;
        if (v.includes("/") && base) return `${base}/${v.replace(/^\/+/, "")}`;
        return null;
      }
    }
    if (typeof value === "object") {
      return normalizeUrl((value as any).url || (value as any).href || (value as any).src);
    }
    return null;
  };

  const findUrlDeep = (value: any, depth: number, visited: Set<any>): string | null => {
    if (!value || depth <= 0) return null;
    if (typeof value === "string") return normalizeUrl(value);
    if (typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findUrlDeep(item, depth - 1, visited);
        if (found) return found;
      }
      return null;
    }

    const entries = Object.entries(value as Record<string, any>);
    const priority: Array<[string, any]> = [];
    const rest: Array<[string, any]> = [];
    for (const [k, v] of entries) {
      if (/(foto|photo|avatar|imagem|image|profile)/i.test(k)) priority.push([k, v]);
      else rest.push([k, v]);
    }

    for (const [, v] of priority) {
      const direct = normalizeUrl(v);
      if (direct) return direct;
      const found = findUrlDeep(v, depth - 1, visited);
      if (found) return found;
    }

    for (const [, v] of rest) {
      const found = findUrlDeep(v, depth - 1, visited);
      if (found) return found;
    }

    return null;
  };

  const candidatos = [
    payload?.fotoUrl,
    payload?.foto,
    payload?.fotoPerfil,
    payload?.fotoPerfilUrl,
    payload?.avatar,
    payload?.avatarUrl,
    payload?.imagem,
    payload?.imagemUrl,
    payload?.profilePhoto,
    payload?.imageUrl,
    payload?.atleta?.fotoUrl,
    payload?.atleta?.foto,
    payload?.atleta?.fotoPerfil,
    payload?.atleta?.fotoPerfilUrl,
    payload?.usuario?.fotoUrl,
    payload?.usuario?.foto,
    payload?.usuario?.fotoPerfil,
    payload?.usuario?.fotoPerfilUrl,
    payload?.user?.fotoUrl,
    payload?.user?.foto,
    payload?.user?.fotoPerfil,
    payload?.user?.fotoPerfilUrl,
    payload?.data?.fotoUrl,
    payload?.data?.foto,
    payload?.data?.atleta?.fotoUrl,
    payload?.data?.usuario?.fotoUrl,
    payload?.foto?.url,
    payload?.fotoPerfil?.url,
    payload?.avatar?.url,
    payload?.image?.url,
    payload?.imagem?.url,
    payload?.atleta?.foto?.url,
    payload?.atleta?.fotoPerfil?.url,
    payload?.usuario?.foto?.url,
    payload?.usuario?.fotoPerfil?.url,
    payload?.data?.foto?.url,
    payload?.data?.avatar?.url,
  ];
  for (const c of candidatos) {
    const url = normalizeUrl(c);
    if (url) return url;
  }
  const subtrees = [
    payload?.atleta,
    payload?.usuario,
    payload?.user,
    payload?.data?.atleta,
    payload?.data?.usuario,
    payload?.data?.user,
    payload?.data,
  ].filter(Boolean);
  for (const subtree of subtrees) {
    const found = findUrlDeep(subtree, 6, new Set());
    if (found) return found;
  }
  return null;
}

function extrairFotoFileId(payload: any): string | null {
  const visited = new Set<any>();

  const pick = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === "string") {
      const v = value.replace(/[`'"\s]/g, "").trim();
      if (/^[0-9a-f-]{36}$/i.test(v)) return v;
      try {
        const u = new URL(v);
        const last = u.pathname.split("/").filter(Boolean).pop() || "";
        if (/^[0-9a-f-]{36}$/i.test(last)) return last;
      } catch {}
      return null;
    }
    if (typeof value === "object") {
      const obj = value as any;
      const v = pick(obj.id || obj._id || obj.fileId || obj.fotoId || obj.imagemId);
      if (v) return v;
    }
    return null;
  };

  const walk = (value: any, depth: number): string | null => {
    if (!value || depth <= 0) return null;
    if (typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value.slice(0, 10)) {
        const found = pick(item) || walk(item, depth - 1);
        if (found) return found;
      }
      return null;
    }

    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (/(foto|photo|avatar|imagem|image|profile)/i.test(k)) {
        const found = pick(v) || walk(v, depth - 1);
        if (found) return found;
      }
    }

    for (const v of Object.values(value as Record<string, any>)) {
      const found = walk(v, depth - 1);
      if (found) return found;
    }

    return null;
  };

  const direct = pick(payload);
  if (direct) return direct;
  return walk(payload, 6);
}

async function resolverFotoPorFileId(params: { token: string; fileId: string }) {
  const baseRaw = process.env.PLAYNAQUADRA_API_URL || "";
  const base = baseRaw.endsWith("/") ? baseRaw.slice(0, -1) : baseRaw;
  if (!base) return null;

  const candidates = [
    `${base}/arquivo/${params.fileId}`,
    `${base}/arquivos/${params.fileId}`,
    `${base}/file/${params.fileId}`,
    `${base}/files/${params.fileId}`,
    `${base}/imagem/${params.fileId}`,
    `${base}/image/${params.fileId}`,
    `${base}/foto/${params.fileId}`,
    `${base}/fotos/${params.fileId}`,
    `${base}/midia/${params.fileId}`,
    `${base}/media/${params.fileId}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "manual",
        headers: { Authorization: `Bearer ${params.token}` },
      });

      const location = res.headers.get("location");
      if (location) {
        try {
          const resolved = new URL(location, url).toString();
          if (resolved) return resolved;
        } catch {}
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (res.ok && contentType.startsWith("image/")) return url;

      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        const maybe = extrairFotoUrl(data);
        if (maybe) return maybe;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function coletarCamposFoto(payload: any) {
  const results: Array<{ path: string; type: string; length?: number; sample?: string }> = [];
  const visited = new Set<any>();

  const pushValue = (path: string, value: any) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      const v = value.trim();
      results.push({
        path,
        type: "string",
        length: v.length,
        sample:
          v.length > 120
            ? `${v.slice(0, 60)}…${v.slice(-40)}`
            : v,
      });
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      results.push({ path, type: typeof value, sample: String(value) });
      return;
    }
    if (typeof value === "object") {
      results.push({ path, type: Array.isArray(value) ? "array" : "object" });
    }
  };

  const walk = (value: any, path: string, depth: number) => {
    if (depth <= 0) return;
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < Math.min(value.length, 8); i++) {
        walk(value[i], `${path}[${i}]`, depth - 1);
      }
      return;
    }

    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      const nextPath = path ? `${path}.${k}` : k;
      if (/(foto|photo|avatar|imagem|image|profile)/i.test(k)) {
        pushValue(nextPath, v);
        if (typeof v === "object") {
          walk(v, nextPath, depth - 1);
        }
      } else {
        walk(v, nextPath, depth - 1);
      }
    }
  };

  walk(payload, "", 6);
  return results.slice(0, 120);
}

function extrairEmail(payload: any): string | null {
  const candidatos = [
    payload?.email,
    payload?.usuario?.email,
    payload?.user?.email,
    payload?.atleta?.email,
    payload?.data?.email,
    payload?.data?.usuario?.email,
    payload?.data?.atleta?.email,
  ];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c.trim().toLowerCase();
  }
  return null;
}

function normalizarTexto(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ymdSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeYmd(value: string | null) {
  const v = (value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return ymdSaoPaulo();
}

function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days, 0, 0, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function dataHorarioLocalDateSql(targetYmd: string) {
  return sql`timezone('America/Sao_Paulo', timezone('UTC', ${partidas.dataHorario}))::date = ${targetYmd}::date`;
}

async function buscarFotoNoPlay(params: { token: string; playId?: string | null; email?: string; nome?: string }) {
  const email = (params.email || "").trim().toLowerCase();
  const nome = (params.nome || "").trim();
  const playId = (params.playId || "").trim();

  let fotoUrl: string | null = null;
  let resolvedPlayId: string | null = playId || null;

  if (resolvedPlayId) {
    const { res, data } = await playGetAtletaById({ token: params.token, atletaId: resolvedPlayId });
    if (res.ok && data) {
      fotoUrl = extrairFotoUrl(data);
      if (!fotoUrl) {
        const fileId = extrairFotoFileId(data);
        if (fileId) fotoUrl = await resolverFotoPorFileId({ token: params.token, fileId });
      }
    }
  }

  if (!fotoUrl) {
    const termosBusca = Array.from(
      new Set(
        [resolvedPlayId, email, nome].filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      )
    );
    for (const termo of termosBusca) {
      const busca = await playBuscarAtletas({ token: params.token, q: termo, limite: 20 });
      if (!busca.res.ok || !busca.data) continue;
      const listaBusca = Array.isArray(busca.data?.atletas)
        ? busca.data.atletas
        : Array.isArray(busca.data)
          ? busca.data
          : [];

      const byEmail = email ? listaBusca.find((x: any) => extrairEmail(x) === email) : null;
      const byNome = nome
        ? listaBusca.find((x: any) => normalizarTexto(x?.nome || x?.usuario?.nome || x?.atleta?.nome) === normalizarTexto(nome))
        : null;
      const first = byEmail || byNome || listaBusca[0] || null;

      if (first) {
        const id = String(first?.id || first?._id || first?.atletaId || first?.usuarioId || "").trim();
        if (id && !resolvedPlayId) resolvedPlayId = id;
        fotoUrl = extrairFotoUrl(first);
        if (!fotoUrl) {
          const fileId = extrairFotoFileId(first);
          if (fileId) fotoUrl = await resolverFotoPorFileId({ token: params.token, fileId });
        }
        if (fotoUrl) break;
      }

      fotoUrl = extrairFotoUrl(busca.data);
      if (!fotoUrl) {
        const fileId = extrairFotoFileId(busca.data);
        if (fileId) fotoUrl = await resolverFotoPorFileId({ token: params.token, fileId });
      }
      if (fotoUrl) break;
    }
  }

  return { fotoUrl, resolvedPlayId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const dataStr = searchParams.get("data"); // YYYY-MM-DD
    const dataYmd = normalizeYmd(dataStr);

    const rows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        placarA: partidas.placarA,
        placarB: partidas.placarB,
        detalhesPlacar: partidas.detalhesPlacar,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        arenaNome: arenas.nome,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        dataHorario: partidas.dataHorario,
        quadra: partidas.quadra,
      })
      .from(partidas)
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .leftJoin(arenas, eq(partidas.arenaId, arenas.id))
      .where(
        and(
          eq(partidas.torneioId, torneio.id),
          dataHorarioLocalDateSql(dataYmd)
        )
      )
      .orderBy(asc(partidas.dataHorario));

    if (rows.length === 0) {
      return NextResponse.json({ 
        torneio,
        partidas: [] 
      });
    }

    const equipeIds = Array.from(new Set(rows.flatMap((r) => [r.equipeAId, r.equipeBId]).filter(Boolean))) as string[];
    const mapNomes = await equipesDisplayService.mapNomesEquipes(equipeIds);
    
    const atletasRows = await db
      .select({
        equipeId: equipeIntegrantes.equipeId,
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaFotoUrl: usuarios.fotoUrl,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));

    const mapAtletas = new Map<string, { id: string; nome: string; fotoUrl: string | null }[]>();
    for (const a of atletasRows) {
      const current = mapAtletas.get(a.equipeId) ?? [];
      current.push({ id: a.atletaId, nome: a.atletaNome, fotoUrl: a.atletaFotoUrl ?? null });
      mapAtletas.set(a.equipeId, current);
    }

    const partidasResult = rows.map((r) => ({
      ...r,
      equipeANome: mapNomes.get(r.equipeAId) ?? null,
      equipeBNome: mapNomes.get(r.equipeBId) ?? null,
      equipeAAtletas: r.equipeAId ? mapAtletas.get(r.equipeAId) ?? [] : [],
      equipeBAtletas: r.equipeBId ? mapAtletas.get(r.equipeBId) ?? [] : [],
    }));

    return NextResponse.json({
      torneio,
      partidas: partidasResult
    });
  } catch (error) {
    console.error("Erro ao listar jogos do dia:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams: sp } = new URL(request.url);
    const debug = sp.get("debug") === "1";

    const body = (await request.json().catch(() => null)) as any;
    const usuarioId = typeof body?.usuarioId === "string" ? body.usuarioId.trim() : "";

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    if (usuarioId) {
      const user = await db
        .select({
          id: usuarios.id,
          nome: usuarios.nome,
          email: usuarios.email,
          fotoUrl: usuarios.fotoUrl,
          playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
        })
        .from(usuarios)
        .where(eq(usuarios.id, usuarioId))
        .limit(1);

      if (user.length === 0) {
        return NextResponse.json({ ok: false, usuarioId, error: "Atleta não encontrado" } satisfies SyncOneResult, { status: 404 });
      }

      const token = await getPlayAdminToken();
      try {
        const { fotoUrl, resolvedPlayId } = await buscarFotoNoPlay({
          token,
          playId: user[0].playnaquadraAtletaId,
          email: user[0].email,
          nome: user[0].nome,
        });

        if (!fotoUrl) {
          let debugPayload: any = undefined;
          if (debug) {
            let byIdStatus: number | null = null;
            let byIdCamposFoto: any[] | null = null;
            if (resolvedPlayId) {
              const byId = await playGetAtletaById({ token, atletaId: resolvedPlayId }).catch(() => null as any);
              byIdStatus = byId?.res?.status ?? null;
              byIdCamposFoto = byId?.data ? coletarCamposFoto(byId.data) : null;
            }
            const termos = Array.from(
              new Set([String(resolvedPlayId || ""), user[0].email, user[0].nome].map((x) => String(x || "").trim()).filter(Boolean))
            ).slice(0, 3);
            const buscas: any[] = [];
            for (const q of termos) {
              const b = await playBuscarAtletas({ token, q, limite: 5 }).catch(() => null as any);
              buscas.push({
                q,
                status: b?.res?.status ?? null,
                camposFoto: b?.data ? coletarCamposFoto(b.data) : null,
              });
            }
            debugPayload = {
              playnaquadraAtletaId: user[0].playnaquadraAtletaId,
              resolvedPlayId,
              byIdStatus,
              byIdCamposFoto,
              buscas,
            };
          }
          const tinhaFoto = Boolean(user[0].fotoUrl && String(user[0].fotoUrl).trim().length > 0);
          if (tinhaFoto) {
            await db.update(usuarios).set({ fotoUrl: null, atualizadoEm: new Date() }).where(eq(usuarios.id, usuarioId));
          }
          return NextResponse.json(
            { ok: true, usuarioId, consultado: true, atualizado: tinhaFoto, fotoUrl: null, ...(debug ? { debug: debugPayload } : {}) } satisfies any,
            { headers: { "Cache-Control": "no-store" } }
          );
        }

        const precisaAtualizar =
          !user[0].fotoUrl ||
          user[0].fotoUrl.trim() !== fotoUrl.trim() ||
          Boolean(!user[0].playnaquadraAtletaId && resolvedPlayId);
        if (precisaAtualizar) {
          await db
            .update(usuarios)
            .set({ fotoUrl, playnaquadraAtletaId: resolvedPlayId || user[0].playnaquadraAtletaId, atualizadoEm: new Date() })
            .where(eq(usuarios.id, usuarioId));
        }

        return NextResponse.json(
          { ok: true, usuarioId, consultado: true, atualizado: precisaAtualizar, fotoUrl } satisfies SyncOneResult,
          { headers: { "Cache-Control": "no-store" } }
        );
      } catch {
        return NextResponse.json(
          { ok: false, usuarioId, error: "Falha ao consultar Play Na Quadra" } satisfies SyncOneResult,
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const dataStr = searchParams.get("data"); // YYYY-MM-DD
    const dataYmd = normalizeYmd(dataStr);

    const rows = await db
      .select({
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(
        and(
          eq(partidas.torneioId, torneio.id),
          dataHorarioLocalDateSql(dataYmd)
        )
      );

    const equipeIds = Array.from(new Set(rows.flatMap((r) => [r.equipeAId, r.equipeBId]).filter(Boolean))) as string[];
    if (equipeIds.length === 0) {
      return NextResponse.json(
        {
          totalAtletas: 0,
          totalComPlayId: 0,
          atualizados: 0,
          consultados: 0,
          jaAtualizados: 0,
          semFotoNoPlay: 0,
          falhasConsulta: 0,
        } satisfies SyncResult,
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const atletas = await db
      .select({
        usuarioId: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        fotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));

    const porUsuario = new Map<string, { nome: string; email: string; fotoUrl: string | null; playId: string | null }>();
    for (const a of atletas) {
      if (!porUsuario.has(a.usuarioId)) {
        porUsuario.set(a.usuarioId, {
          nome: a.nome,
          email: a.email,
          fotoUrl: a.fotoUrl ?? null,
          playId: a.playnaquadraAtletaId ?? null,
        });
      }
    }

    const lista = Array.from(porUsuario.entries()).map(([usuarioId, value]) => ({
      usuarioId,
      nome: value.nome,
      email: value.email,
      fotoUrl: value.fotoUrl,
      playId: value.playId,
    }));

    const alvo = lista.filter((i) => i.playId);
    if (!alvo.length) {
      return NextResponse.json(
        {
          totalAtletas: lista.length,
          totalComPlayId: 0,
          atualizados: 0,
          consultados: 0,
          jaAtualizados: 0,
          semFotoNoPlay: 0,
          falhasConsulta: 0,
        } satisfies SyncResult,
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const token = await getPlayAdminToken();
    let atualizados = 0;
    let consultados = 0;
    let jaAtualizados = 0;
    let semFotoNoPlay = 0;
    let falhasConsulta = 0;

    for (const atleta of alvo) {
      try {
        consultados += 1;
        const { fotoUrl } = await buscarFotoNoPlay({ token, playId: atleta.playId, email: atleta.email, nome: atleta.nome });

        if (!fotoUrl) {
          semFotoNoPlay += 1;
          continue;
        }
        if (atleta.fotoUrl && atleta.fotoUrl.trim() === fotoUrl.trim()) {
          jaAtualizados += 1;
          continue;
        }

        await db.update(usuarios).set({ fotoUrl, atualizadoEm: new Date() }).where(eq(usuarios.id, atleta.usuarioId));
        atualizados += 1;
      } catch {
        falhasConsulta += 1;
        continue;
      }
    }

    return NextResponse.json(
      {
        totalAtletas: lista.length,
        totalComPlayId: alvo.length,
        atualizados,
        consultados,
        jaAtualizados,
        semFotoNoPlay,
        falhasConsulta,
      } satisfies SyncResult,
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao sincronizar fotos (jogos do dia):", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
