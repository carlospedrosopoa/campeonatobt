import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService } from "@/services/panelinhas.service";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const convites = await panelinhasService.listarConvitesPendentes(auth.user.id);
  return NextResponse.json({ convites }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}
