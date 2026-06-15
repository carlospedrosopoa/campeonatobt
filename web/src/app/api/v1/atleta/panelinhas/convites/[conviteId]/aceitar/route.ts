import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService } from "@/services/panelinhas.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conviteId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { conviteId } = await params;
    const convite = await panelinhasService.aceitarConvite(conviteId, auth.user.id);
    return NextResponse.json(convite, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível aceitar o convite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
