import { NextResponse } from "next/server";
import { esportesService } from "@/services/esportes.service";

export async function GET() {
  try {
    const esportes = await esportesService.listarTodos();
    return NextResponse.json(esportes);
  } catch (error) {
    console.error("Erro ao listar esportes:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
