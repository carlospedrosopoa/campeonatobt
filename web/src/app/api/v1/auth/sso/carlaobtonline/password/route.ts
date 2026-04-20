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

export async function POST(request: NextRequest) {
  const baseRaw = process.env.CARLAOBTONLINE_API_URL || process.env.NEXT_PUBLIC_CARLAOBTONLINE_API_URL || "";
  const base = cleanBaseUrl(baseRaw);
  if (!base) return NextResponse.json({ error: "CARLAOBTONLINE_API_URL não configurada" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as any;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const next = typeof body?.next === "string" ? body.next : "/atleta/torneios";

  if (!email || !password) return NextResponse.json({ error: "Email e senha são obrigatórios" }, { status: 400 });

  const loginRes = await fetch(`${base}/api/user/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const login = await loginRes.json().catch(() => null as any);
  const token = typeof login?.token === "string" ? login.token : "";
  if (!loginRes.ok || !token) {
    return NextResponse.json({ error: login?.mensagem || login?.error || "Credenciais inválidas" }, { status: 401 });
  }

  const meRes = await fetch(`${base}/api/user/auth/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const me = await meRes.json().catch(() => null as any);
  if (!meRes.ok || !me) {
    return NextResponse.json({ error: me?.mensagem || me?.error || "Token inválido no carlaobtonline" }, { status: 401 });
  }

  const role = String(me?.role || "").toUpperCase();
  if (role !== "USER") return NextResponse.json({ error: "Acesso negado. Login é apenas para atletas." }, { status: 403 });

  const nome = (typeof me?.nome === "string" ? me.nome : typeof me?.name === "string" ? me.name : email.split("@")[0]).trim();

  const existente = await db
    .select({ id: usuarios.id, perfil: usuarios.perfil, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1);

  let userId: string;
  if (existente[0]) {
    if (existente[0].perfil !== "ATLETA") return NextResponse.json({ error: "Email já está vinculado a um usuário não-atleta" }, { status: 409 });
    userId = existente[0].id;
    await db
      .update(usuarios)
      .set({ nome: nome || existente[0].nome, atualizadoEm: new Date() })
      .where(eq(usuarios.id, userId));
  } else {
    const [created] = await db
      .insert(usuarios)
      .values({ nome, email, perfil: "ATLETA" })
      .returning({ id: usuarios.id });
    userId = created.id;
  }

  await createSession({ id: userId, nome, email, perfil: "ATLETA" });

  return NextResponse.json({ ok: true, next }, { headers: { "Cache-Control": "no-store" } });
}

