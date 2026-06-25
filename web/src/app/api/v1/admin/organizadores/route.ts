import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";

export async function GET() {
  try {
    const acesso = await requireGlobalAdmin();
    if ("response" in acesso) return acesso.response;

    const lista = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
        criadoEm: usuarios.criadoEm,
      })
      .from(usuarios)
      .where(eq(usuarios.perfil, "ORGANIZADOR"))
      .orderBy(asc(usuarios.nome));

    return NextResponse.json(lista, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao listar organizers:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const acesso = await requireGlobalAdmin();
    if ("response" in acesso) return acesso.response;

    const body = (await request.json().catch(() => null)) as
      | {
          nome?: string;
          email?: string;
          senha?: string;
          telefone?: string | null;
        }
      | null;

    const nome = (body?.nome || "").trim();
    const email = (body?.email || "").trim().toLowerCase();
    const senha = body?.senha || "";
    const telefone = (body?.telefone || "").trim();

    if (!nome || !email || !senha) {
      return NextResponse.json({ error: "Nome, email e senha são obrigatórios" }, { status: 400 });
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: "A senha deve ter pelo menos 6 caracteres" }, { status: 400 });
    }

    const existente = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    if (existente[0]) {
      return NextResponse.json({ error: "Já existe um usuário com este email" }, { status: 409 });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const [novo] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        senha: senhaHash,
        telefone: telefone || null,
        perfil: "ORGANIZADOR",
      })
      .returning({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
      });

    return NextResponse.json(novo, { status: 201 });
  } catch (error) {
    console.error("Erro ao cadastrar organizer:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
