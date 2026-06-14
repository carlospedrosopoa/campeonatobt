import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { playBuscarAtletas } from "@/services/playnaquadra-client";
import { and, eq, or, sql } from "drizzle-orm";

type PlayCandidate = {
  id: string;
  playnaquadraAtletaId: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  fotoUrl: string | null;
};

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function extractPlayCandidate(item: unknown): PlayCandidate | null {
  const source = item && typeof item === "object" ? (item as Record<string, any>) : null;
  if (!source) return null;

  const playnaquadraAtletaId =
    String(source.id || source._id || source.atletaId || source.usuarioId || "").trim() || null;
  const usuario = source.usuario && typeof source.usuario === "object" ? (source.usuario as Record<string, any>) : null;
  const atleta = source.atleta && typeof source.atleta === "object" ? (source.atleta as Record<string, any>) : null;
  const nome = String(source.nome || usuario?.nome || atleta?.nome || "").trim();
  const email = normalizeEmail(source.email || usuario?.email || atleta?.email || "");
  const telefone = String(source.telefone || usuario?.telefone || atleta?.telefone || "").trim() || null;
  const fotoUrl = String(source.fotoUrl || source.foto_url || usuario?.fotoUrl || atleta?.fotoUrl || "").trim() || null;

  if (!playnaquadraAtletaId && !nome && !email) return null;

  return {
    id: playnaquadraAtletaId || "",
    playnaquadraAtletaId,
    nome: nome || email || "Atleta",
    email,
    telefone,
    fotoUrl,
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
    if (!tokenPlay) {
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
          nome: usuarios.nome,
          email: usuarios.email,
          telefone: usuarios.telefone,
          fotoUrl: usuarios.fotoUrl,
        })
        .from(usuarios)
        .where(where)
        .limit(limite);

      return NextResponse.json({ atletas: rows, total: rows.length }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
    }

    const result = await playBuscarAtletas({ token: tokenPlay, q, limite });
    if (result.res.status === 401) {
      const response = NextResponse.json(
        { error: "Sessão do Play na Quadra expirada. Faça login novamente." },
        { status: 401 }
      );
      response.cookies.set("play_token", "", { expires: new Date(0), path: "/" });
      return response;
    }
    if (!result.res.ok) return NextResponse.json({ error: "Falha ao buscar atletas no Play na Quadra" }, { status: 502 });

    const rawCandidates: unknown[] = Array.isArray(result.data?.atletas) ? result.data.atletas : Array.isArray(result.data) ? result.data : [];
    const atletas = rawCandidates.map(extractPlayCandidate).filter(hasResolvedPlayProfile);

    return NextResponse.json(
      { atletas, total: atletas.length },
      { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao buscar atletas" }, { status: 500 });
  }
}
