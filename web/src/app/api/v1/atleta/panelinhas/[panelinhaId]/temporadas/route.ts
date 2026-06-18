import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService, type CriarPanelinhaTemporadaDTO } from "@/services/panelinhas.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId } = await params;
    const temporadas = await panelinhasService.listarTemporadas(panelinhaId, auth.user.id);
    return NextResponse.json({ temporadas }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível listar as temporadas";
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
    const body = (await request.json().catch(() => null)) as Partial<CriarPanelinhaTemporadaDTO> | null;
    const temporada = await panelinhasService.criarTemporada(panelinhaId, auth.user.id, (body ?? {}) as CriarPanelinhaTemporadaDTO);
    return NextResponse.json(temporada, { status: 201, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível criar a temporada";
    const status = message === "Panelinha não encontrada" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
