import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";

function getTokenFromRequest(request: NextRequest) {
  const header = request.headers.get("x-integration-token");
  if (header && header.trim()) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function sanitizeUrl(value: string) {
  return value.replace(/[`'"\s]/g, "").trim();
}

export async function POST(request: NextRequest) {
  const secret = (process.env.CAMPEONATOBT_INTEGRATION_TOKEN || process.env.INTEGRATION_CARLAOBTONLINE_TOKEN || "").trim();
  const token = getTokenFromRequest(request);
  if (!secret || token !== secret) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as any;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const playId = typeof body?.playnaquadraAtletaId === "string" ? body.playnaquadraAtletaId.trim() : "";
  const fotoUrlRaw = typeof body?.fotoUrl === "string" ? body.fotoUrl : null;
  const fotoUrl = fotoUrlRaw && fotoUrlRaw.trim().length > 0 ? sanitizeUrl(fotoUrlRaw) : null;

  if (!email && !playId) return NextResponse.json({ error: "email ou playnaquadraAtletaId é obrigatório" }, { status: 400 });

  if (playId) {
    const updated = await db
      .update(usuarios)
      .set({ fotoUrl, atualizadoEm: new Date() })
      .where(eq(usuarios.playnaquadraAtletaId, playId))
      .returning({ id: usuarios.id, fotoUrl: usuarios.fotoUrl });
    if (updated.length > 0) return NextResponse.json({ ok: true, updated: updated[0] }, { headers: { "Cache-Control": "no-store" } });
  }

  if (email) {
    const updated = await db
      .update(usuarios)
      .set({ fotoUrl, atualizadoEm: new Date() })
      .where(eq(usuarios.email, email))
      .returning({ id: usuarios.id, fotoUrl: usuarios.fotoUrl });
    if (updated.length > 0) return NextResponse.json({ ok: true, updated: updated[0] }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

