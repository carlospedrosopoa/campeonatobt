import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService, type CriarPanelinhaPlayDTO } from "@/services/panelinhas.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId } = await params;
    const plays = await panelinhasService.listarPlays(panelinhaId, auth.user.id);
    return NextResponse.json({ plays }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível listar os plays";
    const status = message === "Panelinha não encontrada" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId } = await params;
    const body = (await request.json().catch(() => null)) as Partial<CriarPanelinhaPlayDTO> | null;
    const play = await panelinhasService.criarPlay(panelinhaId, auth.user.id, body as CriarPanelinhaPlayDTO);
    return NextResponse.json(play, { status: 201, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível criar o play";
    const status = message === "Panelinha não encontrada" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
