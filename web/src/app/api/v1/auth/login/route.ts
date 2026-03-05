import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = (body?.email as string | undefined)?.trim().toLowerCase();
    const senha = body?.senha as string | undefined;

    if (!email || !senha) {
      return NextResponse.json({ error: "Email e senha são obrigatórios" }, { status: 400 });
    }

    const resultado = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        senha: usuarios.senha,
        perfil: usuarios.perfil,
      })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);

    const user = resultado[0];
    if (!user) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    const stored = user.senha ?? "";
    let ok = false;
    if (stored.startsWith("$2")) {
      ok = await bcrypt.compare(senha, stored);
    } else {
      ok = senha === stored;
    }

    if (!ok) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    await createSession({
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
    });

    return NextResponse.json({ ok: true, user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil } });
  } catch (error) {
    console.error("Erro no login:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

