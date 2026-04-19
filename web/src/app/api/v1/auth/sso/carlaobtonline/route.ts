import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";

function cleanBaseUrl(raw: string) {
  let base = (raw || "").trim();
  if (base.endsWith("/")) base = base.slice(0, -1);
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

function getBearer(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

export async function POST(request: NextRequest) {
  const baseRaw = process.env.CARLAOBTONLINE_API_URL || process.env.NEXT_PUBLIC_CARLAOBTONLINE_API_URL || "";
  const base = cleanBaseUrl(baseRaw);
  if (!base) return NextResponse.json({ error: "CARLAOBTONLINE_API_URL não configurada" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as any;
  const token = getBearer(request) || String(body?.token || "").trim();
  if (!token) return NextResponse.json({ error: "Token do carlaobtonline é obrigatório" }, { status: 400 });

  const meRes = await fetch(`${base}/api/user/auth/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const me = await meRes.json().catch(() => null as any);
  if (!meRes.ok || !me) {
    return NextResponse.json(
      { error: me?.mensagem || me?.error || "Token inválido no carlaobtonline" },
      { status: 401 }
    );
  }

  const role = String(me?.role || "").toUpperCase();
  if (role !== "USER") {
    return NextResponse.json({ error: "Acesso negado. SSO é apenas para atletas." }, { status: 403 });
  }

  const email = typeof me?.email === "string" ? me.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Usuário sem email no carlaobtonline" }, { status: 400 });

  const nome = (typeof me?.nome === "string" ? me.nome : typeof me?.name === "string" ? me.name : email.split("@")[0]).trim();

  const existente = await db
    .select({ id: usuarios.id, perfil: usuarios.perfil, nome: usuarios.nome, email: usuarios.email })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1);

  let userId: string;
  if (existente[0]) {
    if (existente[0].perfil !== "ATLETA") {
      return NextResponse.json({ error: "Email já está vinculado a um usuário não-atleta" }, { status: 409 });
    }
    userId = existente[0].id;
    await db
      .update(usuarios)
      .set({ nome: nome || existente[0].nome, atualizadoEm: new Date() })
      .where(eq(usuarios.id, userId));
  } else {
    const [created] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        perfil: "ATLETA",
      })
      .returning({ id: usuarios.id });
    userId = created.id;
  }

  const sessionToken = await createSession({ id: userId, nome, email, perfil: "ATLETA" });

  return NextResponse.json(
    { ok: true, token: sessionToken, user: { id: userId, nome, email, perfil: "ATLETA" } },
    { headers: { "Cache-Control": "no-store" } }
  );
}

