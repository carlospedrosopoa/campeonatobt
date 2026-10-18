import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { ErroSmart, informarPagamentoSmart } from "@/services/smart-torneio.service";

/** O criador avisa que fez o Pix; o pedido vai para a aprovacao do Play na Quadra. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    const r = await informarPagamentoSmart({ id, usuarioId: auth.user.id });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErroSmart) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
