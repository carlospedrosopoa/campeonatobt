import { NextRequest, NextResponse } from "next/server";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";
import { ErroRanking, criarRanking, listarRankings } from "@/services/rankings.service";

export async function GET() {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  return NextResponse.json({ rankings: await listarRankings() }, { headers: { "Cache-Control": "no-store" } });
}

/** Body: { nome, descricao?, janelaMeses, imagemUrl? } */
export async function POST(request: NextRequest) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  try {
    const b = (await request.json().catch(() => null)) ?? {};
    const adminId = String((acesso.user as { id?: string }).id ?? "") || null;
    return NextResponse.json(await criarRanking(b, adminId), { status: 201 });
  } catch (e) {
    if (e instanceof ErroRanking) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Erro ao criar ranking:", e);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
