import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { playBuscarAtletas } from "@/services/playnaquadra-client";
import { and, eq, or, sql } from "drizzle-orm";

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
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao buscar atletas" }, { status: 500 });
  }
}
