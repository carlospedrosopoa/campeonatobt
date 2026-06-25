import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { arenasService } from "@/services/arenas.service";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playListarPoints } from "@/services/playnaquadra-client";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    try {
      const token = await getPlayAdminToken();
      const { res, data } = await playListarPoints({ token, apenasAtivos: true });
      if (res.ok && data?.success && Array.isArray(data.points)) {
        await arenasService.sincronizarComPoints({
          torneioId: torneio.id,
          points: data.points
            .filter((point: any) => point?.id && point?.nome)
            .map((point: any) => ({
              id: point.id,
              nome: point.nome,
              logoUrl: point.logoUrl ?? null,
            })),
        });
      }
    } catch (syncError) {
      console.error("Falha ao sincronizar arenas por points:", syncError);
    }

    const lista = await arenasService.listarPorTorneio(torneio.id);
    return NextResponse.json(lista);
  } catch (error) {
    console.error("Erro ao listar arenas:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const body = await request.json().catch(() => null);
    const nome = (body?.nome as string | undefined)?.trim();
    if (!nome) return NextResponse.json({ error: "Nome Ã© obrigatÃ³rio" }, { status: 400 });

    const created = await arenasService.criar({ torneioId: torneio.id, nome });
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

