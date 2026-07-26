import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { torneios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { arenasService } from "@/services/arenas.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ torneioId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { torneioId } = await params;
  const tId = (torneioId || "").trim();
  if (!tId) return NextResponse.json({ error: "torneioId inválido" }, { status: 400 });

  const torneioRows = await db.select({ id: torneios.id }).from(torneios).where(eq(torneios.id, tId)).limit(1);
  if (!torneioRows[0]) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  const arenas = await arenasService.listarPorTorneio(tId);
  return NextResponse.json(
    {
      torneioId: tId,
      arenas: arenas.map((arena) => ({
        id: arena.id,
        nome: arena.nome,
        logoUrl: arena.logoUrl ?? null,
        pointId: arena.pointId ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
