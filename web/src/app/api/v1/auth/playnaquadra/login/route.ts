import { NextRequest, NextResponse } from "next/server";
import { playGetUsuarioLogado } from "@/services/playnaquadra-client";
import { createOrUpdateAtletaFromPlayToken } from "@/services/playnaquadra-session.service";

function getBearer(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as any;
    const tokenPlay = getBearer(request) || body?.token;
    if (!tokenPlay) {
      return NextResponse.json({ error: "Token do Play na Quadra é obrigatório" }, { status: 400 });
    }

    const meRes = await playGetUsuarioLogado(tokenPlay);
    if (!meRes.res.ok) {
      return NextResponse.json(
        { error: meRes.data?.mensagem || meRes.data?.error || "Token inválido no Play na Quadra" },
        { status: 401 }
      );
    }

    const { sessionToken, user } = await createOrUpdateAtletaFromPlayToken({ tokenPlay, me: meRes.data });

    const response = NextResponse.json(
      {
        ok: true,
        token: sessionToken,
        user,
      },
      {
        headers: { "Cache-Control": "no-store", Vary: "Authorization" },
      }
    );
    response.cookies.set("play_token", tokenPlay, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Erro no login Play na Quadra:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
