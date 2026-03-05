import { NextRequest, NextResponse } from "next/server";
import { getSessionFromToken } from "@/lib/auth";

export type SessionUser = {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA";
  playnaquadraAtletaId?: string | null;
};

export async function getUserFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const cookieSession = request.cookies.get("session")?.value ?? null;
  const token = bearer || cookieSession;
  if (!token) return null;
  const session = await getSessionFromToken(token);
  const user = session?.user as SessionUser | undefined;
  return user ?? null;
}

export async function requireUser(request: NextRequest): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  return { user };
}

