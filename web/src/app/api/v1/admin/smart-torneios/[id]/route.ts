import { NextRequest, NextResponse } from "next/server";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";
import { ErroSmart, aprovarSmart, recusarSmart } from "@/services/smart-torneio.service";

/** Autorizar ou recusar. Body: { acao: "aprovar" | "recusar", motivo? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  try {
    const { id } = await params;
    const b = (await request.json().catch(() => null)) ?? {};
    const adminId = String((acesso.user as { id?: string }).id ?? "");
    if (b.acao === "aprovar") await aprovarSmart({ id, adminId });
    else if (b.acao === "recusar") await recusarSmart({ id, adminId, motivo: String(b.motivo ?? "") });
    else return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErroSmart) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Erro ao decidir Smart Torneio:", e);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
