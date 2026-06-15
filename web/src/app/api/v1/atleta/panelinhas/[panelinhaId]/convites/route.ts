import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService } from "@/services/panelinhas.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId } = await params;
    const body = (await request.json().catch(() => null)) as { atletaId?: string } | null;
    const atletaId = String(body?.atletaId || "").trim();

    const convite = await panelinhasService.convidar({
      panelinhaId,
      convidadoId: atletaId,
      convidadoPorId: auth.user.id,
    });

    return NextResponse.json(convite, { status: 201, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível enviar o convite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
