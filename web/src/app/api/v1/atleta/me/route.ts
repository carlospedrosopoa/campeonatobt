import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const result = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      perfil: usuarios.perfil,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      fotoUrl: usuarios.fotoUrl,
    })
    .from(usuarios)
    .where(eq(usuarios.id, auth.user.id))
    .limit(1);

  const user = result[0];
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  return NextResponse.json(user, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as any;
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const telefone = typeof body?.telefone === "string" ? body.telefone.trim() : null;
  const fotoUrl = typeof body?.fotoUrl === "string" ? body.fotoUrl.trim() : null;

  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });

  const updated = await db
    .update(usuarios)
    .set({
      nome,
      telefone: telefone || null,
      fotoUrl: fotoUrl || null,
      atualizadoEm: new Date(),
    })
    .where(eq(usuarios.id, auth.user.id))
    .returning({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      perfil: usuarios.perfil,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      fotoUrl: usuarios.fotoUrl,
    });

  const user = updated[0];
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  return NextResponse.json(user, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}
