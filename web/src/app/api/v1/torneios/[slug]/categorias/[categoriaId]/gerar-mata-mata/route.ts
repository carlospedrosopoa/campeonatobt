import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { mataMataService } from "@/services/mata-mata.service";

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
      return NextResponse.json({ error: "Categoria nÃ£o encontrada" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const manualTieBreaksRaw = body?.manualTieBreaks;
    const manualTieBreaks =
      manualTieBreaksRaw && typeof manualTieBreaksRaw === "object"
        ? (Object.fromEntries(
            Object.entries(manualTieBreaksRaw as Record<string, unknown>)
              .map(([k, v]) => {
                const key = String(k || "").trim();
                if (!key) return null;
                if (!Array.isArray(v)) return null;
                const ids = v.map((item) => String(item || "").trim()).filter(Boolean);
                if (ids.length === 0) return null;
                return [key, ids] as const;
              })
              .filter(Boolean) as any
          ) as Record<string, string[]>)
        : undefined;

    const resultado = await mataMataService.gerarPrimeiraFase({ torneioId: torneio.id, categoriaId, manualTieBreaks });
    return NextResponse.json(resultado);
  } catch (error: any) {
    if (error?.code === "TIE_BREAK_REQUIRED" && Array.isArray(error?.tieGroups)) {
      return NextResponse.json(
        { error: error?.message || "Empate técnico exige decisão manual", code: "TIE_BREAK_REQUIRED", tieGroups: error.tieGroups },
        { status: 409 }
      );
    }
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


