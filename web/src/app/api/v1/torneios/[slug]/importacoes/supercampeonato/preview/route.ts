import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { parseSuperCampeonatoResultadosXlsx } from "@/services/supercampeonato-import.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Arquivo não fornecido" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const preview = parseSuperCampeonatoResultadosXlsx(buffer);
    return NextResponse.json({ torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug }, preview }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

