import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ organizerId: string }> }) {
  try {
    const acesso = await requireGlobalAdmin();
    if ("response" in acesso) return acesso.response;

    const { organizerId } = await params;
    const resultado = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
      })
      .from(usuarios)
      .where(and(eq(usuarios.id, organizerId), eq(usuarios.perfil, "ORGANIZADOR")))
      .limit(1);

    const organizer = resultado[0];
    if (!organizer) {
      return NextResponse.json({ error: "Organizer não encontrado" }, { status: 404 });
    }

    return NextResponse.json(organizer, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao carregar organizer:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ organizerId: string }> }) {
  try {
    const acesso = await requireGlobalAdmin();
    if ("response" in acesso) return acesso.response;

    const { organizerId } = await params;
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
    const senha = (body?.senha || "").trim();
    const telefone = (body?.telefone || "").trim();

    if (!nome || !email) {
      return NextResponse.json({ error: "Nome e email são obrigatórios" }, { status: 400 });
    }

    if (senha && senha.length < 6) {
      return NextResponse.json({ error: "A nova senha deve ter pelo menos 6 caracteres" }, { status: 400 });
    }

    const resultado = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.id, organizerId), eq(usuarios.perfil, "ORGANIZADOR")))
      .limit(1);

    if (!resultado[0]) {
      return NextResponse.json({ error: "Organizer não encontrado" }, { status: 404 });
    }

    const emailEmUso = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.email, email), ne(usuarios.id, organizerId)))
      .limit(1);

    if (emailEmUso[0]) {
      return NextResponse.json({ error: "Já existe um usuário com este email" }, { status: 409 });
    }

    const values: Partial<typeof usuarios.$inferInsert> = {
      nome,
      email,
      telefone: telefone || null,
      atualizadoEm: new Date(),
    };

    if (senha) {
      values.senha = await bcrypt.hash(senha, 10);
    }

    const [atualizado] = await db
      .update(usuarios)
      .set(values)
      .where(and(eq(usuarios.id, organizerId), eq(usuarios.perfil, "ORGANIZADOR")))
      .returning({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
      });

    return NextResponse.json(atualizado);
  } catch (error) {
    console.error("Erro ao atualizar organizer:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
