import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const perfilSessao = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfilSessao)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const qRaw = (searchParams.get("q") || "").trim();
    const perfil = (searchParams.get("perfil") || "ATLETA").trim();
    const limitParam = Number(searchParams.get("limit") || "10");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 25) : 10;

    if (qRaw.length < 2) return NextResponse.json([]);

    const q = qRaw.toLowerCase();
    const pattern = `%${q}%`;

    const lista = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
      })
      .from(usuarios)
      .where(
        and(
          eq(usuarios.perfil, perfil as any),
          or(
            sql`lower(${usuarios.nome}) like ${pattern}`,
            sql`lower(${usuarios.email}) like ${pattern}`,
            sql`lower(coalesce(${usuarios.telefone}, '')) like ${pattern}`
          )
        )
      )
      .limit(limit);

    return NextResponse.json(lista);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

