import { NextRequest, NextResponse } from "next/server";
import { playGetAtletaMe, playGetUsuarioLogado, playLogin } from "@/services/playnaquadra-client";
import { createOrUpdateAtletaFromPlayToken, extractPlayIdentity } from "@/services/playnaquadra-session.service";

const CREATE_PROFILE_URL = "https://atleta.playnaquadra.com.br";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as any;
    const email = (body?.email as string | undefined)?.trim().toLowerCase();
    const password = body?.password as string | undefined;
    const next = (body?.next as string | undefined)?.trim() || "/atleta/torneios";

    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha são obrigatórios" }, { status: 400 });
    }

    const login = await playLogin(email, password);
    const tokenPlay = (login.data?.token as string | undefined) ?? "";
    if (!login.res.ok || !tokenPlay) {
      return NextResponse.json({ error: login.data?.mensagem || login.data?.error || "Credenciais inválidas" }, { status: 401 });
    }

    const meRes = await playGetUsuarioLogado(tokenPlay);
    if (!meRes.res.ok) {
      return NextResponse.json({ error: meRes.data?.mensagem || meRes.data?.error || "Falha ao validar token no Play na Quadra" }, { status: 401 });
    }

    const identity = extractPlayIdentity(meRes.data, tokenPlay);
    if (!identity.email) {
      return NextResponse.json({ error: "Seu usuário do Play na Quadra não possui email" }, { status: 400 });
    }

    const atletaMe = await playGetAtletaMe(tokenPlay);
    const semPerfil = atletaMe.res.status === 204 || !identity.atletaId;
    if (semPerfil) {
      return NextResponse.json(
        {
          error: `Seu perfil de atleta ainda não foi criado. Crie primeiro em ${CREATE_PROFILE_URL}`,
          code: "ATLETA_SEM_PERFIL",
          url: CREATE_PROFILE_URL,
        },
        { status: 400 }
      );
    }

    const { user } = await createOrUpdateAtletaFromPlayToken({ tokenPlay, me: meRes.data });

    const response = NextResponse.json({ ok: true, user, next }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("play_token", tokenPlay, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro interno do servidor" }, { status: 500 });
  }
}

