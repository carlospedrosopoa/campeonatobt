import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = await request.json().catch(() => null);
    const nome = String(body?.nome || "").trim();
    if (!nome) {
      return NextResponse.json({ error: "Informe o nome do novo torneio." }, { status: 400 });
    }

    const novo = await torneiosService.clonarSemInscricoes({
      torneioOrigemId: torneio.id,
      nome,
    });

    return NextResponse.json(novo, { status: 201 });
  } catch (error: any) {
    const mensagem = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    console.error("Erro ao clonar torneio:", error);
    return NextResponse.json({ error: mensagem }, { status: 400 });
  }
}
