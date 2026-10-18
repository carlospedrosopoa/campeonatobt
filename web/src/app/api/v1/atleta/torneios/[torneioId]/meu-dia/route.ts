import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { meuDiaDeTorneio } from "@/services/meu-dia.service";

/** "Meu dia de torneio" do atleta logado (app). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ torneioId: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { torneioId } = await params;
    const dados = await meuDiaDeTorneio({ torneioId, usuarioId: auth.user.id });
    if (!dados) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    return NextResponse.json(dados, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error: any) {
    console.error("Erro no meu dia de torneio:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
