import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { categoriasService } from "@/services/categorias.service";
import { mataMataService } from "@/services/mata-mata.service";

type Fase = "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const fase = String(body?.fase || "").trim().toUpperCase() as Fase;
    const confrontosRaw = Array.isArray(body?.confrontos) ? body.confrontos : [];
    const limparPosteriores = body?.limparPosteriores !== false;

    const confrontos = confrontosRaw
      .map((c: any) => ({
        equipeAId: String(c?.equipeAId || "").trim(),
        equipeBId: String(c?.equipeBId || "").trim(),
      }))
      .filter((c: any) => c.equipeAId && c.equipeBId);

    const resultado = await mataMataService.montarFaseManual({
      torneioId: torneio.id,
      categoriaId,
      fase,
      confrontos,
      limparPosteriores,
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

