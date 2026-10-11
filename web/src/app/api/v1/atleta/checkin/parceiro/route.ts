import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { CheckinError, presencaAtletaService } from "@/services/presenca-atleta.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O atleta informa que o parceiro tambem esta presente: { torneioId, parceiroId }
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json().catch(() => null);
    const torneioId = String(body?.torneioId || "");
    const parceiroId = String(body?.parceiroId || "");
    if (!UUID.test(torneioId) || !UUID.test(parceiroId)) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    const resultado = await presencaAtletaService.confirmarParceiro({ usuarioId: auth.user.id, torneioId, parceiroId });
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof CheckinError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro ao confirmar parceiro:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
