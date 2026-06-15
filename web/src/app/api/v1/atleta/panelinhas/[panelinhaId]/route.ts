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
    const panelinha = await panelinhasService.obterDetalhes(panelinhaId, auth.user.id);
    return NextResponse.json(panelinha, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível carregar a panelinha";
    const status = message === "Panelinha não encontrada" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
