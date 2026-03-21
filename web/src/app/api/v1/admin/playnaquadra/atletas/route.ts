import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playBuscarAtletas } from "@/services/playnaquadra-client";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const limiteRaw = request.nextUrl.searchParams.get("limite")?.trim() || "";
    const limite = Math.min(50, Math.max(5, Number(limiteRaw || 20) || 20));

    if (q.length < 2) return NextResponse.json({ atletas: [], total: 0 }, { headers: { "Cache-Control": "no-store" } });

    const tokenPlay = await getPlayAdminToken();
    const result = await playBuscarAtletas({ token: tokenPlay, q, limite });
    
    if (!result.res.ok) return NextResponse.json({ error: "Falha ao buscar atletas no Play na Quadra" }, { status: 502 });
    
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao buscar atletas" }, { status: 500 });
  }
}
