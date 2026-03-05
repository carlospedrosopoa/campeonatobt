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

