import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { panelinhasService } from "@/services/panelinhas.service";
import { panelinhaRankingService } from "@/services/panelinha-ranking.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ panelinhaId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  try {
    const { panelinhaId } = await params;
    await panelinhasService.obterDetalhes(panelinhaId, auth.user.id);

    const temporadaId = request.nextUrl.searchParams.get("temporadaId");
    const atletaId = request.nextUrl.searchParams.get("atletaId") || auth.user.id;

    const ranking = await panelinhaRankingService.obterRanking(panelinhaId, temporadaId);
    const semanas =
      ranking.temporada && atletaId
        ? await panelinhaRankingService.listarSemanasAtleta(ranking.temporada.id, atletaId)
        : [];

    return NextResponse.json(
      { temporada: ranking.temporada, ranking: ranking.ranking, atletas: ranking.atletas, semanas },
      { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
    );
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Não foi possível carregar o ranking";
    const status = message === "Panelinha não encontrada" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
