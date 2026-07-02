import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categorias } from "@/db/schema";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneioComunicacoesService } from "@/services/torneio-comunicacoes.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const acesso = await requireTournamentAdminBySlug(slug);
  if ("response" in acesso) return acesso.response;

  const { torneio } = acesso;

  const categoriasRows = await db
    .select({
      id: categorias.id,
      nome: categorias.nome,
      dataHorario: categorias.dataHorario,
    })
    .from(categorias)
    .where(eq(categorias.torneioId, torneio.id))
    .orderBy(asc(categorias.dataHorario), asc(categorias.nome));

  const [comunicacoes, totalTodos, totaisPorCategoria] = await Promise.all([
    torneioComunicacoesService.listarComunicacoesAdmin(torneio.id),
    torneioComunicacoesService.contarDestinatarios({ torneioId: torneio.id }),
    Promise.all(
      categoriasRows.map(async (categoria) => ({
        categoriaId: categoria.id,
        total: await torneioComunicacoesService.contarDestinatarios({
          torneioId: torneio.id,
          categoriaId: categoria.id,
        }),
      }))
    ),
  ]);

  return NextResponse.json(
    {
      torneio: {
        id: torneio.id,
        nome: torneio.nome,
        slug: torneio.slug,
      },
      categorias: categoriasRows.map((categoria) => ({
        id: categoria.id,
        nome: categoria.nome,
        dataHorario: categoria.dataHorario ? categoria.dataHorario.toISOString() : null,
        totalDestinatarios: totaisPorCategoria.find((item) => item.categoriaId === categoria.id)?.total ?? 0,
      })),
      preview: {
        totalDestinatarios: totalTodos,
      },
      comunicacoes: comunicacoes.map((item) => ({
        ...item,
        criadoEm: item.criadoEm.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const acesso = await requireTournamentAdminBySlug(slug);
  if ("response" in acesso) return acesso.response;

  const { torneio, user } = acesso;
  const body = await request.json().catch(() => null);

  const titulo = String(body?.titulo || "").trim();
  const mensagem = String(body?.mensagem || "").trim();
  const categoriaId = String(body?.categoriaId || "").trim() || null;
  const enviarWhatsapp = body?.enviarWhatsapp !== false;
  const publicarNoApp = body?.publicarNoApp !== false;

  if (!mensagem) {
    return NextResponse.json({ error: "Informe a mensagem da comunicação." }, { status: 400 });
  }

  if (!enviarWhatsapp && !publicarNoApp) {
    return NextResponse.json({ error: "Selecione ao menos um canal de envio." }, { status: 400 });
  }

  if (categoriaId) {
    const categoria = await db
      .select({ id: categorias.id })
      .from(categorias)
      .where(and(eq(categorias.id, categoriaId), eq(categorias.torneioId, torneio.id)))
      .limit(1);

    if (categoria.length === 0) {
      return NextResponse.json({ error: "Categoria inválida para este torneio." }, { status: 400 });
    }
  }

  try {
    const result = await torneioComunicacoesService.criarComunicacao({
      torneioId: torneio.id,
      torneioNome: torneio.nome,
      criadoPorId: user.id,
      categoriaId,
      titulo,
      mensagem,
      enviarWhatsapp,
      publicarNoApp,
    });

    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Não foi possível enviar a comunicação." },
      { status: 400 }
    );
  }
}
