import { NextRequest, NextResponse } from "next/server";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";
import {
  ErroRanking,
  adicionarAtleta,
  atualizarRanking,
  detalharRanking,
  excluirLancamento,
  excluirRanking,
  lancarPontos,
  removerAtleta,
} from "@/services/rankings.service";

type Ctx = { params: Promise<{ id: string }> };

function erro(e: unknown) {
  if (e instanceof ErroRanking) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("Erro no ranking:", e);
  return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  try {
    const { id } = await params;
    return NextResponse.json(await detalharRanking(id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return erro(e);
  }
}

/** Body: { nome, descricao?, dataInicio, dataFim, imagemUrl? } */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  try {
    const { id } = await params;
    await atualizarRanking(id, (await request.json().catch(() => null)) ?? {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  try {
    const { id } = await params;
    await excluirRanking(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e);
  }
}

/**
 * Body: { acao: "adicionarAtleta" (atleta do Play, pontosIniciais?, observacao?)
 *   | "removerAtleta" (usuarioId) | "lancar" (usuarioId, pontos, observacao) | "excluirLancamento" (lancamentoId) }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  try {
    const { id } = await params;
    const b = (await request.json().catch(() => null)) ?? {};
    const adminId = String((acesso.user as { id?: string }).id ?? "") || null;
    if (b.acao === "adicionarAtleta") {
      return NextResponse.json(
        await adicionarAtleta({ rankingId: id, atleta: b.atleta, pontosIniciais: b.pontosIniciais, observacao: b.observacao, criadoPorId: adminId })
      );
    }
    if (b.acao === "removerAtleta") await removerAtleta(id, String(b.usuarioId ?? ""));
    else if (b.acao === "lancar")
      await lancarPontos({ rankingId: id, usuarioId: String(b.usuarioId ?? ""), pontos: b.pontos, observacao: b.observacao, criadoPorId: adminId });
    else if (b.acao === "excluirLancamento") await excluirLancamento(id, String(b.lancamentoId ?? ""));
    else return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e);
  }
}
