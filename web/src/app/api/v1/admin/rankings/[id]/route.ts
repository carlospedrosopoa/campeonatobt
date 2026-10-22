import { NextRequest, NextResponse } from "next/server";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";
import {
  ErroRanking,
  adicionarAtleta,
  atualizarCategoria,
  atualizarRanking,
  criarCategoria,
  detalharRanking,
  excluirCategoria,
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

/** Body: { nome, descricao?, janelaMeses, imagemUrl? } */
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
 * Body: { acao, ... }
 *   criarCategoria (nome, genero?) | editarCategoria (categoriaId, nome, genero?) | excluirCategoria (categoriaId)
 *   adicionarAtleta (categoriaId, atleta do Play, pontosIniciais?, observacao?, dataReferencia?)
 *   removerAtleta (categoriaId, usuarioId) | lancar (categoriaId, usuarioId, pontos, observacao, dataReferencia?)
 *   excluirLancamento (lancamentoId)
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  try {
    const { id } = await params;
    const b = (await request.json().catch(() => null)) ?? {};
    const adminId = String((acesso.user as { id?: string }).id ?? "") || null;
    const categoriaId = String(b.categoriaId ?? "");
    if (b.acao === "criarCategoria") return NextResponse.json(await criarCategoria(id, b.nome, b.genero));
    if (b.acao === "adicionarAtleta") {
      return NextResponse.json(
        await adicionarAtleta({
          rankingId: id,
          categoriaId,
          atleta: b.atleta,
          pontosIniciais: b.pontosIniciais,
          observacao: b.observacao,
          dataReferencia: b.dataReferencia,
          criadoPorId: adminId,
        })
      );
    }
    if (b.acao === "editarCategoria") await atualizarCategoria(id, categoriaId, b.nome, b.genero);
    else if (b.acao === "excluirCategoria") await excluirCategoria(id, categoriaId);
    else if (b.acao === "removerAtleta") await removerAtleta(id, categoriaId, String(b.usuarioId ?? ""));
    else if (b.acao === "lancar")
      await lancarPontos({
        rankingId: id,
        categoriaId,
        usuarioId: String(b.usuarioId ?? ""),
        pontos: b.pontos,
        observacao: b.observacao,
        dataReferencia: b.dataReferencia,
        criadoPorId: adminId,
      });
    else if (b.acao === "excluirLancamento") await excluirLancamento(id, String(b.lancamentoId ?? ""));
    else return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e);
  }
}
