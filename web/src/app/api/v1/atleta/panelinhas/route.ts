import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService } from "@/services/panelinhas.service";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const panelinhas = await panelinhasService.listarMinhas(auth.user.id);
  return NextResponse.json({ panelinhas }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const body = (await request.json().catch(() => null)) as { nome?: string } | null;
    const nome = String(body?.nome || "").trim();
    const panelinha = await panelinhasService.criar({ nome }, auth.user.id);
    return NextResponse.json(panelinha, { status: 201, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível criar a panelinha";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
