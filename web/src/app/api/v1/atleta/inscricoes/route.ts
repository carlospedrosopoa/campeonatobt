import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricoes, partidas, torneios, usuarios } from "@/db/schema";
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
      categoriaId: categorias.id,
      categoriaNome: categorias.nome,
      categoriaSlug: categorias.slug,
      equipeId: equipes.id,
      equipeNome: equipes.nome,
      atletaId: usuarios.id,
      atletaNome: usuarios.nome,
      atletaEmail: usuarios.email,
      atletaTelefone: usuarios.telefone,
    })
    .from(inscricoes)
    .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
    .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
    .innerJoin(torneios, eq(inscricoes.torneioId, torneios.id))
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .where(inArray(inscricoes.id, ids))
    .orderBy(desc(inscricoes.dataInscricao));

  const map = new Map<
    string,
    {
      id: string;
      status: string;
      dataInscricao: Date;
      torneio: { id: string; nome: string; slug: string };
      categoria: { id: string; nome: string };
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
        torneio: { id: r.torneioId, nome: r.torneioNome, slug: r.torneioSlug },
        categoria: { id: r.categoriaId, nome: r.categoriaNome, slug: r.categoriaSlug },
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
  const parceiro = body?.parceiro as any;

  const parceiroNome = (parceiro?.nome as string | undefined)?.trim();
  const parceiroEmail = (parceiro?.email as string | undefined)?.trim().toLowerCase();
  const parceiroTelefone = (parceiro?.telefone as string | undefined)?.trim();
  const parceiroPlayAtletaId = (parceiro?.playnaquadraAtletaId as string | undefined | null)?.trim() || null;

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
    .select({ id: torneios.id, status: torneios.status })
    .from(torneios)
    .where(eq(torneios.id, categoria.torneioId))
    .limit(1);
  const torneio = t[0];
  if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  if (torneio.status !== "ABERTO") return NextResponse.json({ error: "Inscrições não estão abertas para este torneio" }, { status: 400 });

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
    return NextResponse.json(inscricao, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao criar inscrição" }, { status: 400 });
  }
}
