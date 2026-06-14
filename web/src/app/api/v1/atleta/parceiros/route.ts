import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { playBuscarAtletas } from "@/services/playnaquadra-client";
import { and, eq, or, sql } from "drizzle-orm";

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function extractPlayCandidate(item: any) {
  const playnaquadraAtletaId = String(item?.id || item?._id || item?.atletaId || item?.usuarioId || "").trim() || null;
  const nome = String(item?.nome || item?.usuario?.nome || item?.atleta?.nome || "").trim();
  const email = normalizeEmail(item?.email || item?.usuario?.email || item?.atleta?.email || "");
  const telefone = String(item?.telefone || item?.usuario?.telefone || item?.atleta?.telefone || "").trim() || null;
  const fotoUrl = String(item?.fotoUrl || item?.foto_url || item?.usuario?.fotoUrl || item?.atleta?.fotoUrl || "").trim() || null;

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

    const rawCandidates: any[] = Array.isArray(result.data?.atletas) ? result.data.atletas : Array.isArray(result.data) ? result.data : [];
    const atletas = rawCandidates
      .map((item) => extractPlayCandidate(item))
      .filter((item): item is NonNullable<ReturnType<typeof extractPlayCandidate>> => Boolean(item) && Boolean(item.playnaquadraAtletaId));

    return NextResponse.json(
      { atletas, total: atletas.length },
      { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao buscar atletas" }, { status: 500 });
  }
}
