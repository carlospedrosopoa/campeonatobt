import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { getSession } from "@/lib/auth";
import { isTournamentOperator } from "@/lib/torneio-admin-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const user = session?.user as { id: string; perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA" } | undefined;
    if (!user || !isTournamentOperator(user.perfil)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const limit = limitParam ? Number(limitParam) : undefined;
    const offset = offsetParam ? Number(offsetParam) : undefined;

    const torneios = await torneiosService.listarParaUsuario(user, {
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });
    return NextResponse.json(torneios);
  } catch (error) {
    console.error("Erro ao listar torneios:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const user = session?.user as { id: string; perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA" } | undefined;
    if (!user || !isTournamentOperator(user.perfil)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    
    if (!body.nome || !body.slug || !body.dataInicio || !body.dataFim || !body.esporteId || !body.local) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const organizadorId = user.perfil === "ADMIN" ? body.organizadorId ?? user.id : user.id;
    const administradorIds = Array.isArray(body.administradorIds) && user.perfil === "ADMIN" ? body.administradorIds : [];

    const novoTorneio = await torneiosService.criar({
      ...body,
      organizadorId,
      administradorIds,
    });
    return NextResponse.json(novoTorneio, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar torneio:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
