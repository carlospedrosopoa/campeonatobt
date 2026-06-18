import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService } from "@/services/panelinhas.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string; temporadaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId, temporadaId } = await params;
    const temporada = await panelinhasService.encerrarTemporada(panelinhaId, temporadaId, auth.user.id);
    return NextResponse.json(temporada, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível encerrar a temporada";
    const status = message === "Temporada não encontrada" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
