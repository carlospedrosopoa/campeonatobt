import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playBuscarAtletas, playGetAtletaById } from "@/services/playnaquadra-client";
import { resolverGeneroAtleta, type GeneroAtleta } from "@/services/inscricoes.service";

type MeRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: string;
  playnaquadraAtletaId: string | null;
  fotoUrl: string | null;
  genero?: GeneroAtleta | null;
};

type PlayCandidate = {
  playnaquadraAtletaId: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  fotoUrl: string | null;
  genero?: GeneroAtleta | null;
};

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function extractPlayCandidate(item: any): PlayCandidate | null {
  const playnaquadraAtletaId = String(item?.id || item?._id || item?.atletaId || item?.usuarioId || "").trim() || null;
  const nome = String(item?.nome || item?.usuario?.nome || item?.atleta?.nome || "").trim();
  const email = normalizeEmail(item?.email || item?.usuario?.email || item?.atleta?.email || "");
  const telefone = String(item?.telefone || item?.usuario?.telefone || item?.atleta?.telefone || "").trim() || null;
  const fotoUrl = String(item?.fotoUrl || item?.foto_url || item?.usuario?.fotoUrl || item?.atleta?.fotoUrl || "").trim() || null;
  const generoRaw = String(item?.genero || item?.usuario?.genero || item?.atleta?.genero || "").trim().toUpperCase();
  const genero: GeneroAtleta | null = (generoRaw === "MASCULINO" || generoRaw === "FEMININO") ? generoRaw : null;

  if (!playnaquadraAtletaId && !nome && !email) return null;

  return {
    playnaquadraAtletaId,
    nome: nome || email || "Atleta",
    email,
    telefone,
    fotoUrl,
    genero,
  };
}

async function syncUserFromPlay(user: MeRow): Promise<MeRow> {
  const queries = Array.from(
    new Set(
      [
        normalizeEmail(user.email),
        normalizePhone(user.telefone),
        (() => {
          const phone = normalizePhone(user.telefone);
          return phone.length >= 8 ? phone.slice(-8) : "";
        })(),
        normalizeName(user.nome),
      ].filter((value) => String(value || "").trim().length >= 2)
    )
  );

  if (!user.playnaquadraAtletaId?.trim() && queries.length === 0) return user;

  try {
    const token = await getPlayAdminToken();
    const candidates: PlayCandidate[] = [];

    if (user.playnaquadraAtletaId?.trim()) {
      const byId = await playGetAtletaById({ token, atletaId: user.playnaquadraAtletaId.trim() });
      const parsedById = byId.res.ok ? extractPlayCandidate(byId.data) : null;
      if (parsedById) candidates.push(parsedById);
    }

    for (const query of queries) {
      const result = await playBuscarAtletas({ token, q: query, limite: 10 });
      if (!result.res.ok || !result.data) continue;

      const rawCandidates: any[] = Array.isArray(result.data?.atletas) ? result.data.atletas : Array.isArray(result.data) ? result.data : [];
      const parsed = rawCandidates
        .map<PlayCandidate | null>((item: any) => extractPlayCandidate(item))
        .filter((item): item is PlayCandidate => Boolean(item));

      candidates.push(...parsed);
    }

    const unique = new Map<string, PlayCandidate>();
    for (const candidate of candidates) {
      const key = String(candidate.playnaquadraAtletaId || candidate.email || candidate.nome || "").trim();
      if (!key || unique.has(key)) continue;
      unique.set(key, candidate);
    }

    const userEmail = normalizeEmail(user.email);
    const userPhone = normalizePhone(user.telefone);
    const userName = normalizeName(user.nome);
    const ranked = Array.from(unique.values())
      .map((candidate) => {
        let score = 0;
        const candidateEmail = normalizeEmail(candidate.email);
        const candidatePhone = normalizePhone(candidate.telefone);
        const candidateName = normalizeName(candidate.nome);

        if (user.playnaquadraAtletaId && candidate.playnaquadraAtletaId === user.playnaquadraAtletaId) score += 200;
        if (userEmail && candidateEmail === userEmail) score += 120;
        if (userPhone && candidatePhone === userPhone) score += 120;
        if (userPhone && candidatePhone && candidatePhone.endsWith(userPhone.slice(-8))) score += 40;
        if (userName && candidateName === userName) score += 80;
        if (userName && candidateName && (candidateName.includes(userName) || userName.includes(candidateName))) score += 30;
        if (candidate.fotoUrl) score += 5;
        if (candidate.playnaquadraAtletaId) score += 10;

        return { candidate, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.candidate ?? null;
    const bestScore = ranked[0]?.score ?? 0;
    if (!best || bestScore <= 0) return user;

    const updated = await db
      .update(usuarios)
      .set({
        nome: best.nome || user.nome,
        email: best.email || user.email,
        telefone: best.telefone ?? user.telefone ?? null,
        fotoUrl: best.fotoUrl ?? user.fotoUrl ?? null,
        playnaquadraAtletaId: best.playnaquadraAtletaId || user.playnaquadraAtletaId || null,
        atualizadoEm: new Date(),
      })
      .where(eq(usuarios.id, user.id))
      .returning({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
        fotoUrl: usuarios.fotoUrl,
      });

    const merged: MeRow = {
      ...(updated[0] || user),
      genero: best?.genero || user.genero || null,
    };
    return merged;
  } catch {
    return user;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const result = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      perfil: usuarios.perfil,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      fotoUrl: usuarios.fotoUrl,
    })
    .from(usuarios)
    .where(eq(usuarios.id, auth.user.id))
    .limit(1);

  const user = result[0] as MeRow | undefined;
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const syncedUser = await syncUserFromPlay(user);

  // Sempre rodar resolverGeneroAtleta (cascata: blindagem → carlaoBtOnline PRIORIDADE 1 → Play busca → playGetById)
  // Mesmo que Play já tenha retornado um gênero, pois o Play pode estar desatualizado/errado.
  // O carlaobtonline é a fonte da verdade do gênero do atleta.
  let generoFinal: GeneroAtleta | null | undefined = null;
  try {
    const resGenero = await resolverGeneroAtleta({
      nome: syncedUser.nome,
      email: syncedUser.email,
      telefone: syncedUser.telefone,
      playnaquadraAtletaId: syncedUser.playnaquadraAtletaId,
      genero: syncedUser.genero || null,
    });
    if (resGenero?.genero) generoFinal = resGenero.genero;
  } catch {}

  if (!generoFinal) generoFinal = syncedUser.genero || null;

  const respostaFinal: MeRow = { ...syncedUser, genero: generoFinal };

  return NextResponse.json(respostaFinal, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      error: "Os dados do perfil do atleta sao sincronizados do Play na Quadra. Faça as alteracoes diretamente no seu perfil do Play.",
      profileUrl: "https://torneios.playnaquadra.com.br/atleta/perfil",
    },
    { status: 405, headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
