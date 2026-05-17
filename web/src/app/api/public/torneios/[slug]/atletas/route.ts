import { NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { equipeIntegrantes, inscricoes, usuarios } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio || torneio.oculto) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const rows = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        fotoUrl: usuarios.fotoUrl,
      })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
      .where(and(eq(inscricoes.torneioId, torneio.id), eq(inscricoes.status, "APROVADA")))
      .groupBy(usuarios.id, usuarios.nome, usuarios.fotoUrl)
      .orderBy(asc(usuarios.nome));

    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao listar atletas públicos:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
