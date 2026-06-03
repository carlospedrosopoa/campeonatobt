import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, partidas, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

async function upsertAtleta(dados: {
  nome: string;
  email: string;
  telefone?: string | null;
  playnaquadraAtletaId?: string | null;
  fotoUrl?: string | null;
}) {
  const email = dados.email.trim().toLowerCase();
  const nome = dados.nome.trim();
  const playId = (dados.playnaquadraAtletaId || "").trim() || null;

  if (!email) throw new Error("Email do atleta é obrigatório");
  if (!nome) throw new Error("Nome do atleta é obrigatório");

  if (playId) {
    const existingByPlay = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.playnaquadraAtletaId, playId))
      .limit(1);
    if (existingByPlay.length > 0) {
      const id = existingByPlay[0].id;
      await db
        .update(usuarios)
        .set({
          nome,
          email,
          telefone: dados.telefone?.trim() || null,
          ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, id));
      return id;
    }
  }

  const existing = await db.select({ id: usuarios.id, perfil: usuarios.perfil }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (existing.length > 0) {
    const id = existing[0].id;
    if (existing[0].perfil !== "ATLETA") throw new Error("Email já está vinculado a um usuário não-atleta");
    await db
      .update(usuarios)
      .set({
        nome,
        telefone: dados.telefone?.trim() || null,
        playnaquadraAtletaId: playId,
        ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(usuarios.id, id));
    return id;
  }

  const [novo] = await db
    .insert(usuarios)
    .values({
      nome,
      email,
      telefone: dados.telefone?.trim() || null,
      perfil: "ATLETA",
      playnaquadraAtletaId: playId,
      fotoUrl: dados.fotoUrl ?? null,
    })
    .returning({ id: usuarios.id });
  return novo.id;
}

async function calcularValorDevido(params: { torneioId: string; categoriaId: string; usuarioId: string }) {
  const [torneioRow] = await db
    .select({
      valorPrimeiraInscricao: torneios.valorPrimeiraInscricao,
      valorInscricaoAdicional: torneios.valorInscricaoAdicional,
    })
    .from(torneios)
    .where(eq(torneios.id, params.torneioId))
    .limit(1);

  const [catRow] = await db
    .select({ valorInscricao: categorias.valorInscricao })
    .from(categorias)
    .where(eq(categorias.id, params.categoriaId))
    .limit(1);

  const prev = await db
    .select({ total: sql<number>`coalesce(count(*), 0)::int` })
    .from(inscricaoPagamentos)
    .innerJoin(inscricoes, eq(inscricaoPagamentos.inscricaoId, inscricoes.id))
    .where(and(eq(inscricoes.torneioId, params.torneioId), eq(inscricaoPagamentos.usuarioId, params.usuarioId)));

  const jaTem = (prev[0]?.total ?? 0) > 0;
  const valorCategoria = catRow?.valorInscricao ?? null;
  const valorPrimeira = torneioRow?.valorPrimeiraInscricao ?? null;
  const valorAdicional = torneioRow?.valorInscricaoAdicional ?? null;
  if (!jaTem) return valorPrimeira ?? valorCategoria ?? null;
  return valorAdicional ?? valorCategoria ?? null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ inscricaoId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { inscricaoId } = await params;
  const id = (inscricaoId || "").trim();
  if (!id) return NextResponse.json({ error: "inscricaoId inválido" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as any;
  const equipeNome = typeof body?.equipeNome === "string" ? body.equipeNome.trim() : "";
  const parceiro = body?.parceiro as any;

  const parceiroNome = typeof parceiro?.nome === "string" ? parceiro.nome.trim() : "";
  const parceiroEmail = typeof parceiro?.email === "string" ? parceiro.email.trim().toLowerCase() : "";
  const parceiroTelefone = typeof parceiro?.telefone === "string" ? parceiro.telefone.trim() : "";
  const parceiroPlayId = typeof parceiro?.playnaquadraAtletaId === "string" ? parceiro.playnaquadraAtletaId.trim() : "";

  if (!parceiroNome || !parceiroEmail || !parceiroPlayId) {
    return NextResponse.json({ error: "Selecione um parceiro com perfil no Play na Quadra" }, { status: 400 });
  }

  if (parceiroEmail === auth.user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "O parceiro precisa ser diferente de você" }, { status: 400 });
  }

  const insRows = await db
    .select({
      inscricaoId: inscricoes.id,
      torneioId: inscricoes.torneioId,
      categoriaId: inscricoes.categoriaId,
      equipeId: inscricoes.equipeId,
    })
    .from(inscricoes)
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .where(and(eq(inscricoes.id, id), eq(equipeIntegrantes.usuarioId, auth.user.id)))
    .limit(1);
  const ins = insRows[0];
  if (!ins) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });

  const partidasExistentes = await db.select({ id: partidas.id }).from(partidas).where(eq(partidas.categoriaId, ins.categoriaId)).limit(1);
  if (partidasExistentes.length > 0) {
    return NextResponse.json({ error: "Não é possível editar: jogos já foram gerados nesta categoria" }, { status: 400 });
  }

  const pagamentos = await db
    .select({ usuarioId: inscricaoPagamentos.usuarioId, pago: inscricaoPagamentos.pago, status: inscricaoPagamentos.status })
    .from(inscricaoPagamentos)
    .where(eq(inscricaoPagamentos.inscricaoId, ins.inscricaoId));
  const bloqueia = pagamentos.some((p) => Boolean(p.pago) || p.status === "PAGO" || p.status === "PROCESSANDO");
  if (bloqueia) return NextResponse.json({ error: "Não é possível editar: existe pagamento pago ou em processamento" }, { status: 400 });

  const integrantes = await db
    .select({ usuarioId: equipeIntegrantes.usuarioId })
    .from(equipeIntegrantes)
    .where(eq(equipeIntegrantes.equipeId, ins.equipeId));

  const ids = integrantes.map((x) => x.usuarioId);
  const meuId = auth.user.id;
  const parceiroAtualId = ids.find((x) => x !== meuId) ?? null;
  if (!parceiroAtualId) return NextResponse.json({ error: "Falha ao identificar parceiro atual" }, { status: 400 });

  const novoParceiroId = await upsertAtleta({
    nome: parceiroNome,
    email: parceiroEmail,
    telefone: parceiroTelefone || null,
    playnaquadraAtletaId: parceiroPlayId,
  });

  const conflito = await db
    .select({ inscricaoId: inscricoes.id })
    .from(inscricoes)
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .where(and(eq(inscricoes.categoriaId, ins.categoriaId), inArray(equipeIntegrantes.usuarioId, [meuId, novoParceiroId]), sql`${inscricoes.id} <> ${id}`))
    .limit(1);
  if (conflito.length > 0) {
    return NextResponse.json({ error: "Um dos atletas já está inscrito nesta categoria" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    if (equipeNome) {
      await tx.update(equipes).set({ nome: equipeNome }).where(eq(equipes.id, ins.equipeId));
    }

    await tx.delete(equipeIntegrantes).where(and(eq(equipeIntegrantes.equipeId, ins.equipeId), eq(equipeIntegrantes.usuarioId, parceiroAtualId)));
    await tx.delete(equipeIntegrantes).where(and(eq(equipeIntegrantes.equipeId, ins.equipeId), eq(equipeIntegrantes.usuarioId, novoParceiroId)));
    await tx.insert(equipeIntegrantes).values({ equipeId: ins.equipeId, usuarioId: novoParceiroId });

    await tx
      .delete(inscricaoPagamentos)
      .where(and(eq(inscricaoPagamentos.inscricaoId, ins.inscricaoId), eq(inscricaoPagamentos.usuarioId, parceiroAtualId)));

    const valorDevido = await calcularValorDevido({ torneioId: ins.torneioId, categoriaId: ins.categoriaId, usuarioId: novoParceiroId });

    await tx
      .insert(inscricaoPagamentos)
      .values({
        inscricaoId: ins.inscricaoId,
        usuarioId: novoParceiroId,
        pago: false,
        status: "PENDENTE",
        valorDevido,
      })
      .onConflictDoNothing();
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ inscricaoId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { inscricaoId } = await params;
  const id = (inscricaoId || "").trim();
  if (!id) return NextResponse.json({ error: "inscricaoId inválido" }, { status: 400 });

  const insRows = await db
    .select({
      inscricaoId: inscricoes.id,
      categoriaId: inscricoes.categoriaId,
    })
    .from(inscricoes)
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .where(and(eq(inscricoes.id, id), eq(equipeIntegrantes.usuarioId, auth.user.id)))
    .limit(1);
  const ins = insRows[0];
  if (!ins) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });

  const partidasExistentes = await db.select({ id: partidas.id }).from(partidas).where(eq(partidas.categoriaId, ins.categoriaId)).limit(1);
  if (partidasExistentes.length > 0) {
    return NextResponse.json({ error: "Não é possível cancelar: jogos já foram gerados nesta categoria" }, { status: 400 });
  }

  const pagamentos = await db
    .select({ pago: inscricaoPagamentos.pago, status: inscricaoPagamentos.status })
    .from(inscricaoPagamentos)
    .where(eq(inscricaoPagamentos.inscricaoId, ins.inscricaoId));
  const bloqueia = pagamentos.some((p) => Boolean(p.pago) || p.status === "PAGO" || p.status === "PROCESSANDO");
  if (bloqueia) return NextResponse.json({ error: "Não é possível cancelar: existe pagamento pago ou em processamento" }, { status: 400 });

  await db.delete(inscricoes).where(eq(inscricoes.id, ins.inscricaoId));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}
