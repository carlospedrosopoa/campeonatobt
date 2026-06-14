import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, partidas, torneioAtletaPrefs, torneios, usuarios } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { inscricoesService } from "@/services/inscricoes.service";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const idsRows = await db
    .select({ inscricaoId: inscricoes.id })
    .from(inscricoes)
    .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
    .where(eq(equipeIntegrantes.usuarioId, auth.user.id))
    .orderBy(desc(inscricoes.dataInscricao));

  const ids = idsRows.map((r) => r.inscricaoId);
  if (ids.length === 0) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  }

  const rows = await db
    .select({
      inscricaoId: inscricoes.id,
      status: inscricoes.status,
      dataInscricao: inscricoes.dataInscricao,
      torneioId: torneios.id,
      torneioNome: torneios.nome,
      torneioSlug: torneios.slug,
      torneioPixChave: torneios.pixChave,
      torneioPixNome: torneios.pixNome,
      torneioPixCidade: torneios.pixCidade,
      torneioCamisetaOpcoes: torneios.camisetaOpcoes,
      minhaCamisetaOpcao: torneioAtletaPrefs.camisetaOpcao,
      categoriaId: categorias.id,
      categoriaNome: categorias.nome,
      categoriaSlug: categorias.slug,
      categoriaValorInscricao: categorias.valorInscricao,
      equipeId: equipes.id,
      equipeNome: equipes.nome,
      atletaId: usuarios.id,
      atletaNome: usuarios.nome,
      atletaEmail: usuarios.email,
      atletaTelefone: usuarios.telefone,
      meuPago: inscricaoPagamentos.pago,
      meuPagamentoStatus: inscricaoPagamentos.status,
      meuValorDevido: inscricaoPagamentos.valorDevido,
    })
    .from(inscricoes)
    .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
    .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
    .innerJoin(torneios, eq(inscricoes.torneioId, torneios.id))
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .leftJoin(
      torneioAtletaPrefs,
      and(eq(torneioAtletaPrefs.torneioId, torneios.id), eq(torneioAtletaPrefs.usuarioId, auth.user.id))
    )
    .leftJoin(
      inscricaoPagamentos,
      and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, auth.user.id))
    )
    .where(inArray(inscricoes.id, ids))
    .orderBy(desc(inscricoes.dataInscricao));

  const map = new Map<
    string,
    {
      id: string;
      status: string;
      dataInscricao: Date;
      torneio: { id: string; nome: string; slug: string; temJogosEmAndamento: boolean };
      torneioCamisetaOpcoes: string[] | null;
      minhaCamisetaOpcao: string | null;
      categoria: { id: string; nome: string; slug: string; valorInscricao: string | null };
      torneioPix: { chave: string | null; nome: string | null; cidade: string | null };
      meuPagamento: { pago: boolean; status: string; valorDevido: string | null };
      equipe: { id: string; nome: string | null; atletas: { id: string; nome: string; email: string; telefone: string | null }[] };
    }
  >();

  for (const r of rows) {
    const key = r.inscricaoId;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        id: r.inscricaoId,
        status: r.status,
        dataInscricao: r.dataInscricao,
        torneio: { id: r.torneioId, nome: r.torneioNome, slug: r.torneioSlug, temJogosEmAndamento: false },
        torneioCamisetaOpcoes: (r.torneioCamisetaOpcoes as string[] | null) ?? null,
        minhaCamisetaOpcao: r.minhaCamisetaOpcao ?? null,
        categoria: { id: r.categoriaId, nome: r.categoriaNome, slug: r.categoriaSlug, valorInscricao: r.categoriaValorInscricao ?? null },
        torneioPix: { chave: r.torneioPixChave ?? null, nome: r.torneioPixNome ?? null, cidade: r.torneioPixCidade ?? null },
        meuPagamento: {
          pago: Boolean(r.meuPago) || r.meuPagamentoStatus === "PAGO",
          status: r.meuPagamentoStatus ?? (Boolean(r.meuPago) ? "PAGO" : "PENDENTE"),
          valorDevido: r.meuValorDevido ?? null,
        },
        equipe: {
          id: r.equipeId,
          nome: r.equipeNome,
          atletas: [{ id: r.atletaId, nome: r.atletaNome, email: r.atletaEmail, telefone: r.atletaTelefone ?? null }],
        },
      });
    } else {
      current.equipe.atletas.push({ id: r.atletaId, nome: r.atletaNome, email: r.atletaEmail, telefone: r.atletaTelefone ?? null });
    }
  }

  const result = Array.from(map.values());
  const torneioIds = Array.from(new Set(result.map((i) => i.torneio.id).filter(Boolean)));
  if (torneioIds.length > 0) {
    const torneiosComJogos = await db
      .select({ torneioId: partidas.torneioId })
      .from(partidas)
      .where(and(inArray(partidas.torneioId, torneioIds), inArray(partidas.status, ["EM_ANDAMENTO", "FINALIZADA", "WO"] as any)))
      .groupBy(partidas.torneioId);
    const started = new Set(torneiosComJogos.map((t) => t.torneioId));
    for (const item of result) {
      item.torneio.temJogosEmAndamento = started.has(item.torneio.id);
    }
  }
  for (const item of result) {
    const nomeAtual = (item.equipe.nome || "").trim();
    if (!nomeAtual) {
      const nomes = item.equipe.atletas
        .map((a) => (a.nome || "").trim().split(/\s+/)[0])
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      item.equipe.nome = nomes.length > 0 ? nomes.join("/") : "Dupla";
    }
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as any;
  const categoriaId = (body?.categoriaId as string | undefined)?.trim();
  const equipeNome = (body?.equipeNome as string | undefined)?.trim();
  const camisetaOpcaoRaw = typeof body?.camisetaOpcao === "string" ? body.camisetaOpcao.trim() : "";
  const parceiro = body?.parceiro as any;

  const parceiroNome = (parceiro?.nome as string | undefined)?.trim();
  const parceiroEmail = (parceiro?.email as string | undefined)?.trim().toLowerCase();
  const parceiroTelefone = (parceiro?.telefone as string | undefined)?.trim();
  const parceiroPlayAtletaId =
    (parceiro?.playnaquadraAtletaId as string | undefined | null)?.trim() ||
    (parceiro?.id as string | undefined | null)?.trim() ||
    null;

  if (!categoriaId) return NextResponse.json({ error: "categoriaId é obrigatório" }, { status: 400 });
  if (!parceiroNome || !parceiroEmail || !parceiroPlayAtletaId)
    return NextResponse.json({ error: "Selecione um parceiro com perfil no Play na Quadra" }, { status: 400 });

  const cat = await db
    .select({
      id: categorias.id,
      torneioId: categorias.torneioId,
      nome: categorias.nome,
    })
    .from(categorias)
    .where(eq(categorias.id, categoriaId))
    .limit(1);
  const categoria = cat[0];
  if (!categoria) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });

  const t = await db
    .select({ id: torneios.id, status: torneios.status, camisetaOpcoes: torneios.camisetaOpcoes })
    .from(torneios)
    .where(eq(torneios.id, categoria.torneioId))
    .limit(1);
  const torneio = t[0];
  if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  if (torneio.status !== "ABERTO") return NextResponse.json({ error: "Inscrições não estão abertas para este torneio" }, { status: 400 });

  const opcoes = Array.isArray(torneio.camisetaOpcoes) ? (torneio.camisetaOpcoes as any[]).map((s) => String(s)) : [];
  const normalize = (v: string) => (v || "").trim().replace(/\s+/g, " ");
  const mapLower = new Map(opcoes.map((o) => [normalize(o).toLowerCase(), o]));
  const match = camisetaOpcaoRaw ? mapLower.get(normalize(camisetaOpcaoRaw).toLowerCase()) ?? null : null;
  if (opcoes.length > 0 && camisetaOpcaoRaw && !match) {
    return NextResponse.json({ error: "Opção de camiseta inválida para este torneio" }, { status: 400 });
  }

  if (opcoes.length > 0 && !match) {
    const pref = await db
      .select({ id: torneioAtletaPrefs.id })
      .from(torneioAtletaPrefs)
      .where(and(eq(torneioAtletaPrefs.torneioId, torneio.id), eq(torneioAtletaPrefs.usuarioId, auth.user.id)))
      .limit(1);
    if (!pref[0]) {
      return NextResponse.json({ error: "Selecione o tamanho/modelo de camiseta para este torneio" }, { status: 400 });
    }
  }

  const partidasExistentes = await db.select({ id: partidas.id }).from(partidas).where(eq(partidas.categoriaId, categoriaId)).limit(1);
  if (partidasExistentes.length > 0) {
    return NextResponse.json({ error: "Inscrições encerradas: jogos já foram gerados nesta categoria" }, { status: 400 });
  }

  const atleta = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      perfil: usuarios.perfil,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
    })
    .from(usuarios)
    .where(and(eq(usuarios.id, auth.user.id), eq(usuarios.perfil, "ATLETA")))
    .limit(1);
  const atletaUser = atleta[0];
  if (!atletaUser) return NextResponse.json({ error: "Usuário atleta não encontrado" }, { status: 404 });

  if (atletaUser.email.trim().toLowerCase() === parceiroEmail) {
    return NextResponse.json({ error: "O parceiro precisa ser diferente de você" }, { status: 400 });
  }

  try {
    const inscricao = await inscricoesService.criar({
      torneioId: categoria.torneioId,
      categoriaId: categoria.id,
      equipeNome: equipeNome || undefined,
      atletaA: {
        nome: atletaUser.nome,
        email: atletaUser.email,
        telefone: atletaUser.telefone ?? undefined,
        playnaquadraAtletaId: atletaUser.playnaquadraAtletaId ?? null,
      },
      atletaB: {
        nome: parceiroNome,
        email: parceiroEmail,
        telefone: parceiroTelefone || undefined,
        playnaquadraAtletaId: parceiroPlayAtletaId,
      },
      status: "PENDENTE",
    });

    if (match) {
      await db
        .insert(torneioAtletaPrefs)
        .values({ torneioId: torneio.id, usuarioId: auth.user.id, camisetaOpcao: match })
        .onConflictDoUpdate({
          target: [torneioAtletaPrefs.torneioId, torneioAtletaPrefs.usuarioId],
          set: { camisetaOpcao: match, atualizadoEm: new Date() },
        });
    }
    return NextResponse.json(inscricao, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao criar inscrição" }, { status: 400 });
  }
}
