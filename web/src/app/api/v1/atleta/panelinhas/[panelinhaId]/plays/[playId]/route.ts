import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService, type AtualizarPanelinhaPlayDTO } from "@/services/panelinhas.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string; playId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId, playId } = await params;
    const play = await panelinhasService.obterPlayDetalhes(panelinhaId, playId, auth.user.id);
    return NextResponse.json(play, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível carregar o play";
    const status = message === "Play não encontrado" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string; playId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId, playId } = await params;
    const body = (await request.json().catch(() => null)) as Partial<AtualizarPanelinhaPlayDTO> | null;
    const play = await panelinhasService.atualizarPlay(panelinhaId, playId, auth.user.id, (body ?? {}) as AtualizarPanelinhaPlayDTO);
    return NextResponse.json(play, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível atualizar o play";
    const status = message === "Play não encontrado" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
