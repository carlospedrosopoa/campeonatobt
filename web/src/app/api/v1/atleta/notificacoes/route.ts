import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { torneioComunicacoesService } from "@/services/torneio-comunicacoes.service";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

  const data = await torneioComunicacoesService.listarNotificacoesAtleta({
    usuarioId: auth.user.id,
    limit,
  });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store", Vary: "Authorization" },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map((item: any) => String(item || "").trim()).filter(Boolean) : [];

  const result = await torneioComunicacoesService.marcarNotificacoesLidas({
    usuarioId: auth.user.id,
    ids,
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store", Vary: "Authorization" },
  });
}
