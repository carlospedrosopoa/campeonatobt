import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService, type RegistrarResultadoPanelinhaPlayJogoDTO } from "@/services/panelinhas.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string; playId: string; jogoId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId, playId, jogoId } = await params;
    const body = (await request.json().catch(() => null)) as Partial<RegistrarResultadoPanelinhaPlayJogoDTO> | null;
    const jogo = await panelinhasService.registrarResultadoPlayJogo(
      panelinhaId,
      playId,
      jogoId,
      auth.user.id,
      body as RegistrarResultadoPanelinhaPlayJogoDTO
    );
    return NextResponse.json(jogo, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível registrar o resultado";
    const status = message === "Play não encontrado" || message === "Jogo não encontrado" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
