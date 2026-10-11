import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { DuplasSorteadasError, duplasSorteadasService } from "@/services/duplas-sorteadas.service";

type Params = { params: Promise<{ slug: string; categoriaId: string }> };

function erro(e: unknown) {
  if (e instanceof DuplasSorteadasError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error("Erro em duplas sorteadas:", e);
  return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
}

// Situacao da formacao das duplas (atletas sem dupla, duplas formadas, impedimentos)
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    return NextResponse.json(await duplasSorteadasService.estado({ torneioId: acesso.torneio.id, categoriaId }));
  } catch (e) {
    return erro(e);
  }
}

// { acao: "sortear" } | { acao: "formar", inscricaoAId, inscricaoBId } | { acao: "desfazer", inscricaoId } | { acao: "desfazer-todas" }
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { slug, categoriaId } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const body = await request.json().catch(() => null);
    const torneioId = acesso.torneio.id;
    const acao = String(body?.acao || "");
    if (acao === "sortear") return NextResponse.json(await duplasSorteadasService.sortear({ torneioId, categoriaId }));
    if (acao === "formar") {
      return NextResponse.json(
        await duplasSorteadasService.formarManual({
          torneioId,
          categoriaId,
          inscricaoAId: String(body?.inscricaoAId || ""),
          inscricaoBId: String(body?.inscricaoBId || ""),
        }),
      );
    }
    if (acao === "desfazer") {
      return NextResponse.json(await duplasSorteadasService.desfazer({ torneioId, categoriaId, inscricaoId: String(body?.inscricaoId || "") }));
    }
    if (acao === "desfazer-todas") return NextResponse.json(await duplasSorteadasService.desfazer({ torneioId, categoriaId, todas: true }));
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return erro(e);
  }
}
