import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService } from "@/services/panelinhas.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId } = await params;
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") || "").trim();
    const limit = Number(searchParams.get("limit") || 20);

    const result = await panelinhasService.buscarAtletasParaConvite(panelinhaId, auth.user.id, q, limit);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível buscar atletas";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
