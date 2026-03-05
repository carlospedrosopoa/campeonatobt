import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { playBuscarAtletas } from "@/services/playnaquadra-client";

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
    if (!tokenPlay) return NextResponse.json({ error: "Sessão do Play na Quadra expirada. Faça login novamente." }, { status: 401 });

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
