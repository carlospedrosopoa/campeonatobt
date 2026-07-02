import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneioComunicacoesService } from "@/services/torneio-comunicacoes.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; comunicacaoId: string }> }
) {
  const { slug, comunicacaoId } = await params;
  const acesso = await requireTournamentAdminBySlug(slug);
  if ("response" in acesso) return acesso.response;

  try {
    const result = await torneioComunicacoesService.reenviarFalhasComunicacao({
      torneioId: acesso.torneio.id,
      comunicacaoId,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível reenviar as falhas da comunicação." },
      { status: 400 }
    );
  }
}
