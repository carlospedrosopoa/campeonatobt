import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { arenas, categorias, equipeIntegrantes, equipes, grupoEquipes, grupos, inscricaoPagamentos, inscricoes, partidas, rodadas, usuarios } from "@/db/schema";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { slugify } from "@/lib/utils";
import { calcularResultadoSets } from "@/lib/regras-partida";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { classificacaoCategoriaService } from "@/services/classificacao-categoria.service";
import { categoriasService } from "@/services/categorias.service";
import { torneiosService } from "@/services/torneios.service";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playGetAtletaById } from "@/services/playnaquadra-client";
import { parseSuperCampeonatoResultadosXlsx, type SuperImportPreview } from "@/services/supercampeonato-import.service";

function normalizarTexto(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseDataBR(value: string, baseYear: number) {
  const t = (value || "").trim();
  if (!t) return null;
  if (/\bwo\b/i.test(t) || /\bw\.o\b/i.test(t)) return null;
  const iso = new Date(t);
  if (!Number.isNaN(iso.getTime()) && (t.includes("T") || t.includes("-"))) return iso;

  const norm = normalizarTexto(t).replaceAll(".", "/").replaceAll("-", "/");

  const months: Record<string, number> = {
    jan: 1,
    fev: 2,
    mar: 3,
    abr: 4,
    mai: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    set: 9,
    out: 10,
    nov: 11,
    dez: 12,
  };

  const dm = norm.match(/(\d{1,2})\s*\/\s*([0-9]{1,2}|[a-z]{3})(?:\s*\/\s*(\d{2,4}))?/i);
  if (!dm) return null;
  const dia = Number(dm[1]);
  const mesRaw = dm[2].toLowerCase();
  const mes = /^[0-9]+$/.test(mesRaw) ? Number(mesRaw) : months[mesRaw];
  const anoRaw = dm[3] ? Number(dm[3]) : baseYear;
  const ano = anoRaw < 100 ? 2000 + anoRaw : anoRaw;

  let hh = 0;
  let mm = 0;
  const tm = norm.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})/i);
  if (tm) {
    hh = Number(tm[1]);
    mm = Number(tm[2]);
  } else {
    const th = norm.match(/(\d{1,2})\s*h\b/i);
    if (th) hh = Number(th[1]);
  }

  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano) || mes < 1 || mes > 12) return null;
  const dt = new Date(ano, mes - 1, dia, Number(hh) || 0, Number(mm) || 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function extractPlayAtleta(payload: any) {
  const nome = String(payload?.nome || payload?.atleta?.nome || payload?.usuario?.nome || payload?.user?.nome || "").trim();
  const email = String(payload?.email || payload?.usuario?.email || payload?.user?.email || "").trim();
  const telefone = String(payload?.telefone || payload?.celular || payload?.usuario?.telefone || payload?.user?.telefone || "").trim();
  const fotoUrl = String(payload?.fotoUrl || payload?.foto_url || payload?.usuario?.fotoUrl || payload?.user?.fotoUrl || "").trim();
  return { nome, email, telefone: telefone || null, fotoUrl: fotoUrl || null };
}

async function upsertAtletaLocal(
  tx: any,
  params: { nome: string; email: string; telefone: string | null; fotoUrl: string | null; playnaquadraAtletaId: string }
) {
  const existingByPlay = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.playnaquadraAtletaId, params.playnaquadraAtletaId))
    .limit(1);
  if (existingByPlay.length > 0) {
    const id = existingByPlay[0].id;
    await tx
      .update(usuarios)
      .set({
        nome: params.nome,
        email: params.email,
        telefone: params.telefone,
        fotoUrl: params.fotoUrl,
        atualizadoEm: new Date(),
      })
      .where(eq(usuarios.id, id));
    return { id, created: false };
  }

  const existingByEmail = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, params.email)).limit(1);
  if (existingByEmail.length > 0) {
    const id = existingByEmail[0].id;
    await tx
      .update(usuarios)
      .set({
        nome: params.nome,
        telefone: params.telefone,
        playnaquadraAtletaId: params.playnaquadraAtletaId,
        fotoUrl: params.fotoUrl,
        atualizadoEm: new Date(),
      })
      .where(eq(usuarios.id, id));
    return { id, created: false };
  }

  const [novo] = await tx
    .insert(usuarios)
    .values({
      nome: params.nome,
      email: params.email,
      telefone: params.telefone,
      perfil: "ATLETA",
      playnaquadraAtletaId: params.playnaquadraAtletaId,
      fotoUrl: params.fotoUrl,
    })
    .returning();
  return { id: novo.id, created: true };
}

async function buscarEquipePorDupla(tx: any, torneioId: string, atletaAId: string, atletaBId: string) {
  const candidatos = await tx
    .select({ equipeId: equipeIntegrantes.equipeId, cnt: sql<number>`count(*)` })
    .from(equipeIntegrantes)
    .innerJoin(equipes, eq(equipeIntegrantes.equipeId, equipes.id))
    .where(and(eq(equipes.torneioId, torneioId), inArray(equipeIntegrantes.usuarioId, [atletaAId, atletaBId])))
    .groupBy(equipeIntegrantes.equipeId)
    .having(sql`count(*) = 2`)
    .limit(1);
  return candidatos[0]?.equipeId ?? null;
}

async function criarEquipeComIntegrantes(tx: any, torneioId: string, atletaAId: string, atletaBId: string) {
  const [equipe] = await tx.insert(equipes).values({ torneioId, nome: null }).returning();
  await tx.insert(equipeIntegrantes).values([
    { equipeId: equipe.id, usuarioId: atletaAId },
    { equipeId: equipe.id, usuarioId: atletaBId },
  ]);
  return equipe.id;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Arquivo nÃ£o fornecido" }, { status: 400 });

    const payloadRaw = (formData.get("payload") as string | null) ?? "";
    const payload = (payloadRaw ? JSON.parse(payloadRaw) : null) as any;
    const categoriaId = typeof payload?.categoriaId === "string" ? payload.categoriaId.trim() : "";
    const categoriaNome = typeof payload?.categoriaNome === "string" ? payload.categoriaNome.trim() : "";
    const categoriaGenero = payload?.categoriaGenero as "MASCULINO" | "FEMININO" | "MISTO" | undefined;
    const mapeamento = (payload?.mapeamento as Record<string, { playAtletaId: string } | undefined>) ?? {};

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const preview = parseSuperCampeonatoResultadosXlsx(buffer);

    const missingMap = preview.atletas
      .map((a) => a.nomeNormalizado)
      .filter((k) => !mapeamento?.[k]?.playAtletaId);
    if (missingMap.length > 0) {
      const exemplos = missingMap.slice(0, 6).map((k) => preview.atletas.find((a) => a.nomeNormalizado === k)?.nomeOriginal || k);
      return NextResponse.json({ error: `Falta mapear ${missingMap.length} atleta(s). Exemplos: ${exemplos.join(", ")}` }, { status: 400 });
    }

    let categoria = null as (typeof categorias.$inferSelect) | null;
    if (categoriaId) {
      const row = await categoriasService.buscarPorId(categoriaId);
      if (!row || row.torneioId !== torneio.id) return NextResponse.json({ error: "Categoria invÃ¡lida para o torneio" }, { status: 400 });
      categoria = row as any;
    } else {
      if (!categoriaNome || !categoriaGenero) return NextResponse.json({ error: "Informe categoriaNome e categoriaGenero" }, { status: 400 });
      const slugCat = slugify(categoriaNome);
      const existente = await categoriasService.buscarPorSlug(torneio.id, slugCat);
      categoria =
        existente ??
        ((await categoriasService.criar({ torneioId: torneio.id, nome: categoriaNome, genero: categoriaGenero })) as any);
    }
    if (!categoria) return NextResponse.json({ error: "Falha ao resolver categoria" }, { status: 400 });

    const baseYear = new Date(torneio.dataFim as any).getFullYear() || new Date().getFullYear();

    const tokenPlay = await getPlayAdminToken();
    const uniquePlayIds = Array.from(
      new Set(Object.values(mapeamento).map((m) => (m?.playAtletaId || "").trim()).filter(Boolean))
    );

    const playDetailsById = new Map<string, { nome: string; email: string; telefone: string | null; fotoUrl: string | null }>();
    for (const playId of uniquePlayIds) {
      const { res, data } = await playGetAtletaById({ token: tokenPlay, atletaId: playId });
      if (!res.ok) return NextResponse.json({ error: `Falha ao buscar atleta no Play (id=${playId})` }, { status: 502 });
      const det = extractPlayAtleta(data);
      if (!det.email) return NextResponse.json({ error: `Atleta no Play sem email (id=${playId}, nome=${det.nome || "?"})` }, { status: 400 });
      playDetailsById.set(playId, det);
    }

    const counters = {
      atletasCriados: 0,
      atletasAtualizados: 0,
      equipesCriadas: 0,
      inscricoesCriadas: 0,
      grupoCriado: false,
      gruposEquipesCriadas: 0,
      rodadasCriadas: 0,
      arenasCriadas: 0,
      partidasCriadas: 0,
      partidasAtualizadas: 0,
      placaresAplicados: 0,
      placaresIgnorados: 0,
    };
    const warnings: string[] = [];

    const config = await categoriaConfigService.obterOuDefault(categoria.id);
    const regrasBase = config.regrasPartida ?? {
      tipo: "SETS" as const,
      melhorDe: 1 as const,
      gamesPorSet: 6 as const,
      tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
      superTiebreakDecisivo: { habilitado: false, ate: 10, diffMin: 2 },
      incluirSuperTieEmGames: false,
    };
    const regras =
      torneio.superCampeonato
        ? ({
            ...regrasBase,
            tipo: "SETS" as const,
            melhorDe: 3 as const,
            tiebreak: regrasBase.tiebreak ?? { habilitado: true, em: 6, ate: 7, diffMin: 2 },
            superTiebreakDecisivo: {
              habilitado: true,
              ate: (regrasBase as any).superTiebreakDecisivo?.ate ?? 10,
              diffMin: (regrasBase as any).superTiebreakDecisivo?.diffMin ?? 2,
            },
            incluirSuperTieEmGames: false,
          } as const)
        : (regrasBase as any);

    const usuarioIdByNorm = new Map<string, string>();
    const equipeIdByKey = new Map<string, string>();
    const rodadaIdByKey = new Map<string, string>();
    const arenaIdByNome = new Map<string, string>();

    await db.transaction(async (tx) => {
      let grupoId: string | null = null;
      const grupoRow = await tx.select({ id: grupos.id }).from(grupos).where(and(eq(grupos.categoriaId, categoria!.id), eq(grupos.nome, "Geral"))).limit(1);
      if (grupoRow[0]) grupoId = grupoRow[0].id;
      if (!grupoId) {
        const [g] = await tx.insert(grupos).values({ categoriaId: categoria!.id, nome: "Geral" }).returning();
        grupoId = g.id;
        counters.grupoCriado = true;
      }

      const ensureUsuario = async (nomeNormalizado: string) => {
        const cached = usuarioIdByNorm.get(nomeNormalizado);
        if (cached) return cached;
        const playId = (mapeamento?.[nomeNormalizado]?.playAtletaId || "").trim();
        const det = playDetailsById.get(playId);
        if (!det) throw new Error(`Mapeamento invÃ¡lido para atleta: ${nomeNormalizado}`);
        const { id, created } = await upsertAtletaLocal(tx, { ...det, playnaquadraAtletaId: playId });
        if (created) counters.atletasCriados += 1;
        else counters.atletasAtualizados += 1;
        usuarioIdByNorm.set(nomeNormalizado, id);
        return id;
      };

      const ensureEquipe = async (atletaAId: string, atletaBId: string) => {
        const ids = [atletaAId, atletaBId].sort();
        const key = ids.join(":");
        const cached = equipeIdByKey.get(key);
        if (cached) return cached;
        const existente = await buscarEquipePorDupla(tx, torneio.id, atletaAId, atletaBId);
        const equipeId = existente ?? (await criarEquipeComIntegrantes(tx, torneio.id, atletaAId, atletaBId));
        if (!existente) counters.equipesCriadas += 1;
        equipeIdByKey.set(key, equipeId);
        return equipeId;
      };

      const ensureInscricao = async (equipeId: string) => {
        const ins = await tx
          .select({ id: inscricoes.id })
          .from(inscricoes)
          .where(and(eq(inscricoes.torneioId, torneio.id), eq(inscricoes.categoriaId, categoria!.id), eq(inscricoes.equipeId, equipeId)))
          .limit(1);
        if (ins[0]) return ins[0].id;
        const [created] = await tx
          .insert(inscricoes)
          .values({ torneioId: torneio.id, categoriaId: categoria!.id, equipeId, status: "APROVADA" })
          .returning();
        counters.inscricoesCriadas += 1;
        return created.id;
      };

      const ensureGrupoEquipe = async (equipeId: string) => {
        const existing = await tx
          .select({ id: grupoEquipes.id })
          .from(grupoEquipes)
          .where(and(eq(grupoEquipes.grupoId, grupoId!), eq(grupoEquipes.equipeId, equipeId)))
          .limit(1);
        if (existing[0]) return existing[0].id;
        const [created] = await tx.insert(grupoEquipes).values({ grupoId: grupoId!, equipeId }).returning();
        counters.gruposEquipesCriadas += 1;
        return created.id;
      };

      const ensureRodada = async (r: SuperImportPreview["rodadas"][number]) => {
        const key = r.numero ? `n:${r.numero}` : `t:${normalizarTexto(r.nome)}`;
        const cached = rodadaIdByKey.get(key);
        if (cached) return cached;
        const found =
          r.numero !== null
            ? await tx
                .select({ id: rodadas.id })
                .from(rodadas)
                .where(and(eq(rodadas.torneioId, torneio.id), eq(rodadas.categoriaId, categoria!.id), eq(rodadas.numero, r.numero)))
                .limit(1)
            : await tx
                .select({ id: rodadas.id })
                .from(rodadas)
                .where(and(eq(rodadas.torneioId, torneio.id), eq(rodadas.categoriaId, categoria!.id), eq(rodadas.nome, r.nome)))
                .limit(1);
        if (found[0]) {
          rodadaIdByKey.set(key, found[0].id);
          return found[0].id;
        }
        const dataLimite = r.dataLimiteTexto ? parseDataBR(r.dataLimiteTexto, baseYear) : null;
        const [created] = await tx
          .insert(rodadas)
          .values({
            torneioId: torneio.id,
            categoriaId: categoria!.id,
            nome: r.nome,
            numero: r.numero ?? null,
            dataLimite: dataLimite ?? null,
          })
          .returning();
        counters.rodadasCriadas += 1;
        rodadaIdByKey.set(key, created.id);
        return created.id;
      };

      const ensureArena = async (nome: string) => {
        const key = normalizarTexto(nome);
        const cached = arenaIdByNome.get(key);
        if (cached) return cached;
        const existing = await tx.select({ id: arenas.id }).from(arenas).where(and(eq(arenas.torneioId, torneio.id), eq(arenas.nome, nome))).limit(1);
        if (existing[0]) {
          arenaIdByNome.set(key, existing[0].id);
          return existing[0].id;
        }
        const [created] = await tx.insert(arenas).values({ torneioId: torneio.id, nome, pointId: null, logoUrl: null }).returning();
        counters.arenasCriadas += 1;
        arenaIdByNome.set(key, created.id);
        return created.id;
      };

      for (const rodadaPrev of preview.rodadas) {
        const rodadaId = await ensureRodada(rodadaPrev);

        for (const jogo of rodadaPrev.jogos) {
          if (jogo.duplaA.atletas.length !== 2 || jogo.duplaB.atletas.length !== 2) {
            warnings.push(`[${rodadaPrev.nome}] Dupla fora do padrÃ£o: "${jogo.duplaA.texto}" vs "${jogo.duplaB.texto}"`);
            continue;
          }

          const a1 = await ensureUsuario(jogo.duplaA.atletas[0].nomeNormalizado);
          const a2 = await ensureUsuario(jogo.duplaA.atletas[1].nomeNormalizado);
          const b1 = await ensureUsuario(jogo.duplaB.atletas[0].nomeNormalizado);
          const b2 = await ensureUsuario(jogo.duplaB.atletas[1].nomeNormalizado);

          const equipeAId = await ensureEquipe(a1, a2);
          const equipeBId = await ensureEquipe(b1, b2);

          const insA = await ensureInscricao(equipeAId);
          const insB = await ensureInscricao(equipeBId);

          await tx
            .insert(inscricaoPagamentos)
            .values([
              { inscricaoId: insA, usuarioId: a1, pago: false },
              { inscricaoId: insA, usuarioId: a2, pago: false },
              { inscricaoId: insB, usuarioId: b1, pago: false },
              { inscricaoId: insB, usuarioId: b2, pago: false },
            ])
            .onConflictDoNothing();

          await ensureGrupoEquipe(equipeAId);
          await ensureGrupoEquipe(equipeBId);

          const arenaId = jogo.arenaNome ? await ensureArena(jogo.arenaNome) : null;
          const dataHorario = jogo.dataHorarioTexto ? parseDataBR(jogo.dataHorarioTexto, baseYear) : null;
          const dataLimite = rodadaPrev.dataLimiteTexto ? parseDataBR(rodadaPrev.dataLimiteTexto, baseYear) : null;

          let patchResultado: Partial<typeof partidas.$inferInsert> = {};
          if (Array.isArray(jogo.detalhesPlacar) && jogo.detalhesPlacar.length > 0) {
            try {
              const resultado = calcularResultadoSets({
                regras: regras as any,
                equipeAId,
                equipeBId,
                detalhesPlacar: jogo.detalhesPlacar as any,
              });
              patchResultado = {
                detalhesPlacar: resultado.detalhesPlacar as any,
                placarA: resultado.placarA,
                placarB: resultado.placarB,
                vencedorId: resultado.vencedorId,
                status: "FINALIZADA",
                finalizadoEm: new Date(),
              };
              counters.placaresAplicados += 1;
            } catch (e: any) {
              counters.placaresIgnorados += 1;
              warnings.push(`[${rodadaPrev.nome}] Placar invÃ¡lido para "${jogo.duplaA.texto}" vs "${jogo.duplaB.texto}": ${e?.message || "erro"}`);
            }
          }

          const existentes = await tx
            .select({
              id: partidas.id,
              status: partidas.status,
              placarA: partidas.placarA,
              placarB: partidas.placarB,
              vencedorId: partidas.vencedorId,
              detalhesPlacar: partidas.detalhesPlacar,
            })
            .from(partidas)
            .where(
              and(
                eq(partidas.torneioId, torneio.id),
                eq(partidas.categoriaId, categoria!.id),
                eq(partidas.fase, "GRUPOS"),
                eq(partidas.rodadaId, rodadaId),
                or(
                  and(eq(partidas.equipeAId, equipeAId), eq(partidas.equipeBId, equipeBId)),
                  and(eq(partidas.equipeAId, equipeBId), eq(partidas.equipeBId, equipeAId))
                )
              )
            )
            .limit(1);

          const baseSet: Partial<typeof partidas.$inferInsert> = {
            torneioId: torneio.id,
            categoriaId: categoria!.id,
            fase: "GRUPOS",
            rodadaId,
            grupoId,
            arenaId,
            quadra: null,
            dataHorario,
            dataLimite,
          };

          if (existentes[0]) {
            const existente = existentes[0];
            const existenteTemDetalhes = Array.isArray(existente.detalhesPlacar) && existente.detalhesPlacar.length > 0;
            const existenteTemResultado =
              existente.status !== "AGENDADA" &&
              (existenteTemDetalhes || Boolean(existente.vencedorId) || Number(existente.placarA ?? 0) !== 0 || Number(existente.placarB ?? 0) !== 0);

            const podeAplicarResultado = Object.keys(patchResultado).length > 0 && !existenteTemResultado;
            const set = {
              ...baseSet,
              ...(podeAplicarResultado ? patchResultado : {}),
              atualizadoEm: new Date(),
            } as any;
            await tx.update(partidas).set(set).where(eq(partidas.id, existente.id));
            counters.partidasAtualizadas += 1;
          } else {
            const set = {
              ...baseSet,
              equipeAId,
              equipeBId,
              status: "AGENDADA",
              ...(Object.keys(patchResultado).length > 0 ? patchResultado : {}),
            } as any;
            await tx.insert(partidas).values(set);
            counters.partidasCriadas += 1;
          }
        }
      }
    });

    await classificacaoCategoriaService.recalcularPorCategoria(categoria.id);

    return NextResponse.json(
      {
        torneio: { id: torneio.id, nome: torneio.nome, slug: torneio.slug },
        categoria: { id: categoria.id, nome: categoria.nome, genero: categoria.genero, slug: categoria.slug },
        counters,
        warnings: warnings.concat(preview.warnings).slice(0, 200),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    const msg = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

