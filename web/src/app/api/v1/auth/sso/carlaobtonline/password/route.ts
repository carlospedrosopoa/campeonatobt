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

function summarizeBodyText(text: string) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function readJsonOrText(res: Response) {
  try {
    const text = await res.text().catch(() => "");
    try {
      const json = text ? JSON.parse(text) : null;
      return { json, text };
    } catch {
      return { json: null, text };
    }
  } catch {
    return { json: null, text: "" };
  }
}

export async function POST(request: NextRequest) {
  const baseRaw = process.env.CARLAOBTONLINE_API_URL || process.env.NEXT_PUBLIC_CARLAOBTONLINE_API_URL || "";
  const base = cleanBaseUrl(baseRaw);
  if (!base) return NextResponse.json({ error: "CARLAOBTONLINE_API_URL não configurada" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as any;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password.trim() : "";
  const next = typeof body?.next === "string" ? body.next : "/atleta/torneios";

  if (!email || !password) return NextResponse.json({ error: "Email e senha são obrigatórios" }, { status: 400 });

  const loginRes = await fetch(`${base}/api/user/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
    redirect: "follow",
  });

  const loginBody = await readJsonOrText(loginRes);
  const login = (loginBody.json || null) as any;

  if (!loginRes.ok) {
    const upstreamStatus = loginRes.status;
    const status = upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 502;
    const upstreamText = loginBody.json ? "" : summarizeBodyText(loginBody.text);
    return NextResponse.json(
      {
        error: login?.mensagem || login?.error || `Falha no login (${upstreamStatus})`,
        code: "CARLAOBTONLINE_LOGIN_FALHOU",
        upstream: {
          base,
          status: upstreamStatus,
          body: upstreamText || undefined,
        },
      },
      { status }
    );
  }

  if (!login) {
    return NextResponse.json(
      { error: "Resposta inválida do carlaobtonline", code: "CARLAOBTONLINE_RESPOSTA_INVALIDA", upstream: { base, status: loginRes.status } },
      { status: 502 }
    );
  }

  const identity = login?.usuario || login?.user || null;
  if (!identity || typeof identity !== "object") {
    return NextResponse.json(
      { error: "Resposta inválida do carlaobtonline", code: "CARLAOBTONLINE_USUARIO_AUSENTE", upstream: { base, status: loginRes.status } },
      { status: 502 }
    );
  }

  const role = String(identity?.role || "").toUpperCase();
  if (role && role !== "USER") {
    return NextResponse.json({ error: "Acesso negado. Login é apenas para atletas." }, { status: 403 });
  }

  const emailFromIdentity = typeof identity?.email === "string" ? identity.email.trim().toLowerCase() : "";
  const nome = (
    typeof identity?.nome === "string"
      ? identity.nome
      : typeof identity?.name === "string"
        ? identity.name
        : (emailFromIdentity || email).split("@")[0]
  ).trim();
  const normalizedEmail = emailFromIdentity || email;

  const existente = await db
    .select({ id: usuarios.id, perfil: usuarios.perfil, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.email, normalizedEmail))
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
      .values({ nome, email: normalizedEmail, perfil: "ATLETA" })
      .returning({ id: usuarios.id });
    userId = created.id;
  }

  await createSession({ id: userId, nome, email: normalizedEmail, perfil: "ATLETA" });

  return NextResponse.json({ ok: true, next }, { headers: { "Cache-Control": "no-store" } });
}
