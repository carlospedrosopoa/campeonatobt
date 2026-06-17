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
    const body = (await request.json().catch(() => null)) as {
      atletaId?: string;
      playnaquadraAtletaId?: string;
      nome?: string;
      email?: string;
      telefone?: string | null;
      fotoUrl?: string | null;
    } | null;
    const atletaId = String(body?.atletaId || "").trim();

    const convite = await panelinhasService.convidar({
      panelinhaId,
      convidadoId: atletaId,
      convidadoPorId: auth.user.id,
      convidadoPlaynaquadraAtletaId: String(body?.playnaquadraAtletaId || "").trim() || null,
      convidadoNome: String(body?.nome || "").trim() || null,
      convidadoEmail: String(body?.email || "").trim() || null,
      convidadoTelefone: String(body?.telefone || "").trim() || null,
      convidadoFotoUrl: String(body?.fotoUrl || "").trim() || null,
    });

    return NextResponse.json(convite, { status: 201, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível enviar o convite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
