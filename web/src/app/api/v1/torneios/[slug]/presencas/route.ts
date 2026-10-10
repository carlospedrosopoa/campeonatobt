import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { dataSP, dataValida, presencaService } from "@/services/presenca.service";

// Lista de chamada do dia (arbitro/organizador)
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { searchParams } = new URL(request.url);
    const data = dataValida(searchParams.get("data")) ?? dataSP();
    const categoriaId = searchParams.get("categoriaId") || null;
    const lista = await presencaService.listaChamada({ torneioId: acesso.torneio.id, data, categoriaId });
    return NextResponse.json(lista);
  } catch (error) {
    console.error("Erro ao listar presencas:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// Marca ou desmarca a presenca de um atleta no dia
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const body = await request.json().catch(() => null);
    const usuarioId = String(body?.usuarioId || "").trim();
    if (!usuarioId) return NextResponse.json({ error: "Atleta não informado" }, { status: 400 });
    const data = dataValida(body?.data) ?? dataSP();
    const resultado = await presencaService.registrar({
      torneioId: acesso.torneio.id,
      usuarioId,
      data,
      presente: body?.presente !== false,
      origem: acesso.user.perfil === "ADMIN" ? "ADMIN" : "ARBITRO",
      registradoPor: acesso.user.id,
    });
    return NextResponse.json({ usuarioId, data, ...resultado });
  } catch (error) {
    console.error("Erro ao registrar presenca:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
