import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { ErroSmart, buscarSmartPorCodigo } from "@/services/smart-torneio.service";

/** Atleta logado informa o codigo e ve o torneio para se inscrever. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { codigo } = await params;
    return NextResponse.json(await buscarSmartPorCodigo(codigo), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErroSmart) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
