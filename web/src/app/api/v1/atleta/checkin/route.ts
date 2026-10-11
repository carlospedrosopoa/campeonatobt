import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { CheckinError, presencaAtletaService } from "@/services/presenca-atleta.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Status do check-in do atleta nos torneios em que ele joga hoje
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await presencaAtletaService.status(auth.user.id));
  } catch (error) {
    console.error("Erro no status de check-in:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// Check-in do proprio atleta: { torneioId | torneioSlug, origem: "APP" | "QR", token? }
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json().catch(() => null);
    const torneioId = typeof body?.torneioId === "string" && UUID.test(body.torneioId) ? body.torneioId : null;
    const torneioSlug = typeof body?.torneioSlug === "string" ? body.torneioSlug.trim() : null;
    const origem = body?.origem === "QR" ? "QR" : "APP";
    const resultado = await presencaAtletaService.checkin({
      usuarioId: auth.user.id,
      torneioId,
      torneioSlug,
      origem,
      token: typeof body?.token === "string" ? body.token : null,
    });
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof CheckinError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro no check-in:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
