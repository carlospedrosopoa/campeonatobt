import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, grupoEquipes, grupos, inscricaoPagamentos, inscricoes, partidas, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { validarGeneroInscricao } from "@/services/inscricoes.service";
import { extractPlayIdentity } from "@/services/playnaquadra-session.service";
import { playGetUsuarioLogado } from "@/services/playnaquadra-client";

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
      .select({ id: usuarios.id, perfil: usuarios.perfil })
      .from(usuarios)
      .where(eq(usuarios.playnaquadraAtletaId, playId))
      .limit(1);
    if (existingByPlay.length > 0) {
      const athlete = existingByPlay[0];
      if (athlete.perfil !== "ATLETA") throw new Error("Parceiro selecionado está vinculado a um usuário não-atleta");

      const conflictingEmail = await db
        .select({ id: usuarios.id, perfil: usuarios.perfil })
        .from(usuarios)
        .where(and(eq(usuarios.email, email), sql`${usuarios.id} <> ${athlete.id}`))
        .limit(1);

      if (conflictingEmail.length > 0) {
        const emailAthlete = conflictingEmail[0];
        if (emailAthlete.perfil !== "ATLETA") throw new Error("Email já está vinculado a um usuário não-atleta");

        await db.transaction(async (tx) => {
          await tx
            .update(usuarios)
            .set({
              playnaquadraAtletaId: null,
              atualizadoEm: new Date(),
            })
            .where(eq(usuarios.id, athlete.id));

          await tx
            .update(usuarios)
            .set({
              nome,
              email,
              telefone: dados.telefone?.trim() || null,
              playnaquadraAtletaId: playId,
              ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
              atualizadoEm: new Date(),
            })
            .where(eq(usuarios.id, emailAthlete.id));
        });

        return emailAthlete.id;
      }

      await db
        .update(usuarios)
        .set({
          nome,
          email,
          telefone: dados.telefone?.trim() || null,
          ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, athlete.id));
      return athlete.id;
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
  const parceiroGenero = (typeof parceiro?.genero === "string" ? parceiro.genero : "").trim() || null;
  const parceiroPlayId =
    (typeof parceiro?.playnaquadraAtletaId === "string" ? parceiro.playnaquadraAtletaId.trim() : "") ||
    (typeof parceiro?.id === "string" ? parceiro.id.trim() : "");

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
      categoriaGenero: categorias.genero,
      equipeId: inscricoes.equipeId,
    })
    .from(inscricoes)
    .innerJoin(categorias, eq(categorias.id, inscricoes.categoriaId))
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

  let atletaLogadoGenero: string | null = null;
  let parceiroGeneroAtualizado: string | null = parceiroGenero;
  const tokenPlay = request.cookies.get("play_token")?.value || "";
  if (tokenPlay) {
    try {
      const meRes = await playGetUsuarioLogado(tokenPlay);
      if (meRes.res.ok) {
        const identity = extractPlayIdentity(meRes.data, tokenPlay);
        atletaLogadoGenero = identity.genero || null;
      }
    } catch {
      // Se a sessão do Play não responder, segue sem gênero informado (ainda tem fallback por busca).
    }
  }

  // Fallback final de gênero via carlaobtonline (melhor esforço) - PUT
  try {
    const baseClean = (raw: string) => {
      let b = (raw || "").trim();
      if (b.endsWith("/")) b = b.slice(0, -1);
      if (b.endsWith("/api")) b = b.slice(0, -4);
      return b;
    };
    const base = baseClean(process.env.CARLAOBTONLINE_API_URL || process.env.NEXT_PUBLIC_CARLAOBTONLINE_API_URL || "");
    const secret = (process.env.CAMPEONATOBT_INTEGRATION_TOKEN || process.env.INTEGRATION_CARLAOBTONLINE_TOKEN || "").trim();
    if (base && secret) {
      const normEmail = (v?: string | null) => String(v || "").trim().toLowerCase();
      const normPhone = (v?: string | null) => String(v || "").replace(/\D/g, "");
      const normGen = (v: any): "MASCULINO" | "FEMININO" | null => {
        const s = String(v || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
        if (!s) return null;
        if (["m", "masculino", "male", "homem"].includes(s)) return "MASCULINO";
        if (["f", "feminino", "female", "mulher"].includes(s)) return "FEMININO";
        return null;
      };
      const searchCarlao = async (q: string): Promise<any[]> => {
        try {
          const res = await fetch(`${base}/api/atleta/para-selecao?busca=${encodeURIComponent(q)}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${secret}`, "x-integration-token": secret },
            cache: "no-store",
          });
          if (!res.ok) return [];
          const data = await res.json().catch(() => null) as any;
          return Array.isArray(data) ? data : Array.isArray(data?.atletas) ? data.atletas : [];
        } catch {
          return [];
        }
      };

      // Atleta logado (PUT)
      if (!atletaLogadoGenero) {
        const e = normEmail(auth.user.email);
        const f = normPhone(auth.user.telefone);
        const nome = String(auth.user.nome || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        let g: "MASCULINO" | "FEMININO" | null = null;
        if (e) {
          const list = await searchCarlao(e);
          const m = list.find((it) => normEmail(it.email) === e);
          g = normGen(m?.genero);
        }
        if (!g && f) {
          const list = await searchCarlao(f.slice(-8));
          const m = list.find((it) => {
            const ip = normPhone(it.telefone || it.whatsapp || it.fone);
            return (ip && f && ip === f) || (ip && f && ip.endsWith(f.slice(-8)));
          });
          g = normGen(m?.genero);
        }
        if (!g && nome) {
          const list = await searchCarlao(nome);
          const ranked = list
            .map((it: any) => ({
              it,
              n: String(it.nome || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " "),
            }))
            .filter((x) => x.n)
            .map((x) => ({
              ...x,
              sc: x.n === nome ? 100 : nome && x.n && (x.n.includes(nome) || nome.includes(x.n)) ? 40 : 0,
            }))
            .filter((x) => x.sc >= 40)
            .sort((a, b) => b.sc - a.sc);
          g = normGen(ranked[0]?.it?.genero);
        }
        if (g) atletaLogadoGenero = g;
      }

      // Parceiro (PUT)
      if (!parceiroGeneroAtualizado) {
        const e = normEmail(parceiroEmail);
        const f = normPhone(parceiroTelefone);
        const nome = String(parceiroNome || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        let g: "MASCULINO" | "FEMININO" | null = null;
        if (e) {
          const list = await searchCarlao(e);
          const m = list.find((it) => normEmail(it.email) === e);
          g = normGen(m?.genero);
        }
        if (!g && f) {
          const list = await searchCarlao(f.slice(-8));
          const m = list.find((it) => {
            const ip = normPhone(it.telefone || it.whatsapp || it.fone);
            return (ip && f && ip === f) || (ip && f && ip.endsWith(f.slice(-8)));
          });
          g = normGen(m?.genero);
        }
        if (!g && nome) {
          const list = await searchCarlao(nome);
          const ranked = list
            .map((it: any) => ({
              it,
              n: String(it.nome || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " "),
            }))
            .filter((x) => x.n)
            .map((x) => ({
              ...x,
              sc: x.n === nome ? 100 : nome && x.n && (x.n.includes(nome) || nome.includes(x.n)) ? 40 : 0,
            }))
            .filter((x) => x.sc >= 40)
            .sort((a, b) => b.sc - a.sc);
          g = normGen(ranked[0]?.it?.genero);
        }
        if (g) parceiroGeneroAtualizado = g;
      }
    }
  } catch {
    // fallback best-effort: não bloqueia
  }

  await validarGeneroInscricao({
    categoriaGenero: ins.categoriaGenero,
    atletaA: {
      nome: auth.user.nome,
      email: auth.user.email,
      playnaquadraAtletaId: auth.user.playnaquadraAtletaId ?? null,
      genero: atletaLogadoGenero,
    },
    atletaB: {
      nome: parceiroNome,
      email: parceiroEmail,
      playnaquadraAtletaId: parceiroPlayId,
      genero: parceiroGeneroAtualizado,
    },
  });

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

  const antigaEquipeId = ins.equipeId;
  await db.transaction(async (tx) => {
    const [novaEquipe] = await tx
      .insert(equipes)
      .values({
        torneioId: ins.torneioId,
        nome: equipeNome || null,
        capitaoUsuarioId: meuId,
      })
      .returning({ id: equipes.id });

    await tx.insert(equipeIntegrantes).values([
      { equipeId: novaEquipe.id, usuarioId: meuId },
      { equipeId: novaEquipe.id, usuarioId: novoParceiroId },
    ]);

    await tx.update(inscricoes).set({ equipeId: novaEquipe.id }).where(eq(inscricoes.id, id));

    if (antigaEquipeId && antigaEquipeId !== novaEquipe.id) {
      await tx
        .update(partidas)
        .set({ equipeAId: novaEquipe.id })
        .where(
          and(
            eq(partidas.torneioId, ins.torneioId),
            eq(partidas.categoriaId, ins.categoriaId),
            eq(partidas.equipeAId, antigaEquipeId)
          )
        );
      await tx
        .update(partidas)
        .set({ equipeBId: novaEquipe.id })
        .where(
          and(
            eq(partidas.torneioId, ins.torneioId),
            eq(partidas.categoriaId, ins.categoriaId),
            eq(partidas.equipeBId, antigaEquipeId)
          )
        );
      await tx
        .update(grupoEquipes)
        .set({ equipeId: novaEquipe.id })
        .from(grupos)
        .where(
          and(
            eq(grupos.id, grupoEquipes.grupoId),
            eq(grupos.categoriaId, ins.categoriaId),
            eq(grupoEquipes.equipeId, antigaEquipeId)
          )
        );
    }

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
      torneioId: inscricoes.torneioId,
      categoriaId: inscricoes.categoriaId,
      status: inscricoes.status,
      torneioStatus: torneios.status,
    })
    .from(inscricoes)
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .innerJoin(torneios, eq(torneios.id, inscricoes.torneioId))
    .where(and(eq(inscricoes.id, id), eq(equipeIntegrantes.usuarioId, auth.user.id)))
    .limit(1);
  const ins = insRows[0];
  if (!ins) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });
  if (ins.status !== "PENDENTE" && ins.status !== "APROVADA") {
    return NextResponse.json({ error: "Só é possível cancelar inscrições pendentes ou aprovadas" }, { status: 400 });
  }
  if (ins.torneioStatus !== "ABERTO") {
    return NextResponse.json(
      { error: "Não é possível cancelar: inscrições só podem ser canceladas enquanto o torneio estiver ABERTO. Entre em contato com o administrador." },
      { status: 400 }
    );
  }

  const torneioComJogosEmAndamento = await db
    .select({ id: partidas.id })
    .from(partidas)
    .where(and(eq(partidas.torneioId, ins.torneioId), inArray(partidas.status, ["EM_ANDAMENTO", "FINALIZADA", "WO"] as any)))
    .limit(1);
  if (torneioComJogosEmAndamento.length > 0) {
    return NextResponse.json({ error: "Não é possível cancelar: torneio já iniciou (jogos em andamento ou finalizados)" }, { status: 400 });
  }

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
