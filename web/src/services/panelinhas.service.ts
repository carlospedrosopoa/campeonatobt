import { db } from "@/db";
import {
  panelinhaConvites,
  panelinhaMembros,
  panelinhaPlays,
  panelinhaPlayJogos,
  panelinhaPlayParticipantes,
  panelinhas,
  usuarios,
} from "@/db/schema";
import { calcularResultadoSets, type SetScore } from "@/lib/regras-partida";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { playBuscarAtletas } from "@/services/playnaquadra-client";

export type CriarPanelinhaDTO = {
  nome: string;
};

export type ConvidarPanelinhaDTO = {
  panelinhaId: string;
  convidadoId: string;
  convidadoPorId: string;
  convidadoPlaynaquadraAtletaId?: string | null;
  convidadoNome?: string | null;
  convidadoEmail?: string | null;
  convidadoTelefone?: string | null;
  convidadoFotoUrl?: string | null;
};

export type CriarPanelinhaPlayDTO = {
  agendamentoId: string;
  dataHorario: string;
  quadra?: string | null;
  arenaNome?: string | null;
  formato: "SUPER4" | "CONFRONTO_LIVRE";
  participantes: string[];
  jogos?: {
    duplaAAtleta1Id: string;
    duplaAAtleta2Id: string;
    duplaBAtleta1Id: string;
    duplaBAtleta2Id: string;
  }[];
};

export type RegistrarResultadoPanelinhaPlayJogoDTO = {
  detalhesPlacar: SetScore[];
};

export type AtualizarPanelinhaPlayDTO = {
  dataHorario?: string;
  quadra?: string | null;
  arenaNome?: string | null;
  formato?: "SUPER4" | "CONFRONTO_LIVRE";
  participantes?: string[];
  jogos?: {
    duplaAAtleta1Id: string;
    duplaAAtleta2Id: string;
    duplaBAtleta1Id: string;
    duplaBAtleta2Id: string;
  }[];
};

function normalizeText(value?: string | null) {
  return String(value || "").trim();
}

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function hasValidEmailFormat(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function isTemporaryEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;

  const temporaryMarkers = [
    "tempor",
    "temp",
    "provisor",
    "fake",
    "anon",
    "guest",
    "placeholder",
    "sememail",
    "noemail",
    "naotememail",
  ];

  const blockedDomains = [
    "example.com",
    "mailinator.com",
    "tempmail.com",
    "10minutemail.com",
    "yopmail.com",
  ];

  return temporaryMarkers.some((marker) => normalized.includes(marker)) || blockedDomains.some((domain) => normalized.endsWith(`@${domain}`));
}

function isEligibleRealAthlete(row: { perfil?: string | null; email?: string | null; playnaquadraAtletaId?: string | null }) {
  return row.perfil === "ATLETA" && Boolean(normalizeText(row.playnaquadraAtletaId)) && hasValidEmailFormat(row.email) && !isTemporaryEmail(row.email);
}

function extractPlayCandidate(item: unknown) {
  const source = item && typeof item === "object" ? (item as Record<string, any>) : null;
  if (!source) return null;

  const playnaquadraAtletaId =
    String(source.id || source._id || source.atletaId || source.usuarioId || "").trim() || null;
  const usuario = source.usuario && typeof source.usuario === "object" ? (source.usuario as Record<string, any>) : null;
  const atleta = source.atleta && typeof source.atleta === "object" ? (source.atleta as Record<string, any>) : null;
  const nome = String(source.nome || usuario?.nome || atleta?.nome || "").trim();
  const email = normalizeEmail(source.email || usuario?.email || atleta?.email || "") || null;
  const telefone = String(source.telefone || usuario?.telefone || atleta?.telefone || "").trim() || null;
  const fotoUrl = String(source.fotoUrl || source.foto_url || usuario?.fotoUrl || atleta?.fotoUrl || "").trim() || null;

  if (!playnaquadraAtletaId || (!nome && !email)) return null;

  return { playnaquadraAtletaId, nome: nome || email, email, telefone, fotoUrl };
}

function uniqIds(ids: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = normalizeText(raw);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseDateTime(value: string) {
  const d = new Date(String(value || "").trim());
  if (Number.isNaN(d.getTime())) throw new Error("Data/hora inválida");
  return d;
}

function ensureDistinctPlayers(ids: string[]) {
  const normalized = ids.map((v) => normalizeText(v)).filter(Boolean);
  const set = new Set(normalized);
  if (set.size !== normalized.length) throw new Error("Participantes duplicados");
  return normalized;
}

function buildSuper4Jogos(atletas: [string, string, string, string]) {
  const [a, b, c, d] = atletas;
  return [
    { ordem: 1, duplaAAtleta1Id: a, duplaAAtleta2Id: b, duplaBAtleta1Id: c, duplaBAtleta2Id: d },
    { ordem: 2, duplaAAtleta1Id: a, duplaAAtleta2Id: c, duplaBAtleta1Id: b, duplaBAtleta2Id: d },
    { ordem: 3, duplaAAtleta1Id: a, duplaAAtleta2Id: d, duplaBAtleta1Id: b, duplaBAtleta2Id: c },
  ];
}

function validateJogo(jogo: { duplaAAtleta1Id: string; duplaAAtleta2Id: string; duplaBAtleta1Id: string; duplaBAtleta2Id: string }) {
  const ids = ensureDistinctPlayers([jogo.duplaAAtleta1Id, jogo.duplaAAtleta2Id, jogo.duplaBAtleta1Id, jogo.duplaBAtleta2Id]);
  if (ids.length !== 4) throw new Error("Jogo inválido");
  return {
    duplaAAtleta1Id: ids[0],
    duplaAAtleta2Id: ids[1],
    duplaBAtleta1Id: ids[2],
    duplaBAtleta2Id: ids[3],
  };
}

export class PanelinhasService {
  async listarMinhas(atletaId: string) {
    const memberships = await db
      .select({
        panelinhaId: panelinhas.id,
        nome: panelinhas.nome,
        status: panelinhas.status,
        criadaEm: panelinhas.criadoEm,
        fundadorId: panelinhas.fundadorId,
        meuPapel: panelinhaMembros.papel,
        membroStatus: panelinhaMembros.status,
        entrouEm: panelinhaMembros.entrouEm,
      })
      .from(panelinhaMembros)
      .innerJoin(panelinhas, eq(panelinhaMembros.panelinhaId, panelinhas.id))
      .where(and(eq(panelinhaMembros.atletaId, atletaId), eq(panelinhaMembros.status, "ATIVO")))
      .orderBy(desc(panelinhaMembros.entrouEm));

    const panelinhaIds = Array.from(new Set(memberships.map((item) => item.panelinhaId))).filter(Boolean) as string[];
    const fundadorIds = Array.from(new Set(memberships.map((item) => item.fundadorId))).filter(Boolean) as string[];

    const counts =
      panelinhaIds.length > 0
        ? await db
            .select({
              panelinhaId: panelinhaMembros.panelinhaId,
              total: sql<number>`count(*)::int`,
            })
            .from(panelinhaMembros)
            .where(and(inArray(panelinhaMembros.panelinhaId, panelinhaIds), eq(panelinhaMembros.status, "ATIVO")))
            .groupBy(panelinhaMembros.panelinhaId)
        : [];

    const founders =
      fundadorIds.length > 0
        ? await db
            .select({
              id: usuarios.id,
              nome: usuarios.nome,
              fotoUrl: usuarios.fotoUrl,
            })
            .from(usuarios)
            .where(inArray(usuarios.id, fundadorIds))
        : [];

    const countMap = new Map<string, number>(counts.map((item) => [item.panelinhaId, Number(item.total || 0)]));
    const founderMap = new Map<string, { id: string; nome: string; fotoUrl: string | null }>(
      founders.map((item) => [item.id, { id: item.id, nome: item.nome, fotoUrl: item.fotoUrl ?? null }])
    );

    return memberships.map((item) => ({
      id: item.panelinhaId,
      nome: item.nome,
      status: item.status,
      criadaEm: item.criadaEm,
      fundador: founderMap.get(item.fundadorId) ?? null,
      meuPapel: item.meuPapel,
      membroStatus: item.membroStatus,
      entreiEm: item.entrouEm,
      totalMembros: countMap.get(item.panelinhaId) ?? 1,
    }));
  }

  async listarConvitesPendentes(atletaId: string) {
    const invites = await db
      .select({
        id: panelinhaConvites.id,
        criadoEm: panelinhaConvites.criadoEm,
        panelinhaId: panelinhas.id,
        panelinhaNome: panelinhas.nome,
        panelinhaStatus: panelinhas.status,
        convidadoPorId: panelinhaConvites.convidadoPorId,
      })
      .from(panelinhaConvites)
      .innerJoin(panelinhas, eq(panelinhaConvites.panelinhaId, panelinhas.id))
      .where(and(eq(panelinhaConvites.convidadoId, atletaId), eq(panelinhaConvites.status, "PENDENTE")))
      .orderBy(desc(panelinhaConvites.criadoEm));

    const convidadoPorIds = Array.from(new Set(invites.map((item) => item.convidadoPorId))).filter(Boolean) as string[];
    const inviters =
      convidadoPorIds.length > 0
        ? await db
            .select({
              id: usuarios.id,
              nome: usuarios.nome,
              fotoUrl: usuarios.fotoUrl,
            })
            .from(usuarios)
            .where(inArray(usuarios.id, convidadoPorIds))
        : [];

    const inviterMap = new Map<string, { id: string; nome: string; fotoUrl: string | null }>(
      inviters.map((item) => [item.id, { id: item.id, nome: item.nome, fotoUrl: item.fotoUrl ?? null }])
    );

    return invites.map((item) => ({
      id: item.id,
      criadoEm: item.criadoEm,
      panelinha: {
        id: item.panelinhaId,
        nome: item.panelinhaNome,
        status: item.panelinhaStatus,
      },
      convidadoPor: inviterMap.get(item.convidadoPorId) ?? null,
    }));
  }

  async obterDetalhes(panelinhaId: string, atletaId: string) {
    const panelinhaKey = normalizeText(panelinhaId);
    if (!panelinhaKey) throw new Error("Panelinha inválida");

    const member = await this.buscarMembro(panelinhaKey, atletaId);
    if (!member || member.status !== "ATIVO") throw new Error("Você não participa desta panelinha");

    const [panelinha] = await db.select().from(panelinhas).where(eq(panelinhas.id, panelinhaKey)).limit(1);
    if (!panelinha) throw new Error("Panelinha não encontrada");

    const membros = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        fotoUrl: usuarios.fotoUrl,
        papel: panelinhaMembros.papel,
        status: panelinhaMembros.status,
        entrouEm: panelinhaMembros.entrouEm,
      })
      .from(panelinhaMembros)
      .innerJoin(usuarios, eq(panelinhaMembros.atletaId, usuarios.id))
      .where(and(eq(panelinhaMembros.panelinhaId, panelinhaKey), eq(panelinhaMembros.status, "ATIVO")))
      .orderBy(panelinhaMembros.papel, usuarios.nome);

    return {
      id: panelinha.id,
      nome: panelinha.nome,
      status: panelinha.status,
      criadaEm: panelinha.criadoEm,
      fundadorId: panelinha.fundadorId,
      meuPapel: member.papel,
      meuStatus: member.status,
      membros,
    };
  }

  async buscarAtletasParaConvite(panelinhaId: string, atletaId: string, termo: string, limit = 20, tokenPlay?: string | null) {
    const panelinhaKey = normalizeText(panelinhaId);
    const q = normalizeText(termo);
    if (!panelinhaKey) throw new Error("Panelinha inválida");
    if (q.length < 2) return { atletas: [] };

    const member = await this.buscarMembro(panelinhaKey, atletaId);
    if (!member || member.status !== "ATIVO") throw new Error("Apenas membros ativos podem buscar atletas para convite");

    const maxLimit = Math.min(Math.max(limit, 1), 30);
    if (!tokenPlay) return { atletas: [] };

    const playResult = await playBuscarAtletas({ token: tokenPlay, q, limite: maxLimit });
    if (!playResult.res.ok) return { atletas: [] };

    const raw: unknown[] = Array.isArray((playResult.data as any)?.atletas)
      ? (playResult.data as any).atletas
      : Array.isArray(playResult.data)
        ? (playResult.data as any)
        : [];

    const ordered: Array<{
      id: string;
      usuarioId: string | null;
      playnaquadraAtletaId: string;
      nome: string;
      email: string;
      telefone: string | null;
      fotoUrl: string | null;
      convitePendente: boolean;
      origem: "PLAY" | "LOCAL";
    }> = [];
    const seenPlayIds = new Set<string>();

    for (const candidate of raw) {
      const c = extractPlayCandidate(candidate);
      if (!c) continue;

      const playId = normalizeText(c.playnaquadraAtletaId);
      if (!playId || seenPlayIds.has(playId)) continue;

      seenPlayIds.add(playId);
      ordered.push({
        id: playId,
        usuarioId: null,
        playnaquadraAtletaId: playId,
        nome: c.nome || c.email || "Atleta",
        email: c.email || "",
        telefone: c.telefone,
        fotoUrl: c.fotoUrl,
        convitePendente: false,
        origem: "PLAY",
      });

      if (ordered.length >= maxLimit) break;
    }

    return { atletas: ordered };
  }

  async criar(dados: CriarPanelinhaDTO, fundadorId: string) {
    const nome = normalizeText(dados.nome);
    if (nome.length < 3) throw new Error("Nome da panelinha deve ter pelo menos 3 caracteres");

    const fundador = await this.buscarAtletaAtivo(fundadorId);
    if (!fundador) throw new Error("Fundador inválido");

    const created = await db.transaction(async (tx) => {
      const [panelinha] = await tx
        .insert(panelinhas)
        .values({
          nome,
          status: "ATIVA",
          fundadorId: fundador.id,
        })
        .returning();

      await tx.insert(panelinhaMembros).values({
        panelinhaId: panelinha.id,
        atletaId: fundador.id,
        papel: "FUNDADOR",
        status: "ATIVO",
        entrouEm: new Date(),
      });

      return panelinha;
    });

    return created;
  }

  async convidar(dados: ConvidarPanelinhaDTO) {
    const panelinhaId = normalizeText(dados.panelinhaId);
    let convidadoId = normalizeText(dados.convidadoId);
    const convidadoPorId = normalizeText(dados.convidadoPorId);
    const convidadoPlaynaquadraAtletaId = normalizeText(dados.convidadoPlaynaquadraAtletaId);
    const convidadoNome = normalizeText(dados.convidadoNome);
    const convidadoEmail = normalizeEmail(dados.convidadoEmail);
    const convidadoTelefone = normalizeText(dados.convidadoTelefone) || null;
    const convidadoFotoUrl = normalizeText(dados.convidadoFotoUrl) || null;

    if (!panelinhaId) throw new Error("Panelinha inválida");
    if (!convidadoId && !convidadoPlaynaquadraAtletaId) throw new Error("Atleta convidado é obrigatório");

    const [panelinha] = await db.select().from(panelinhas).where(eq(panelinhas.id, panelinhaId)).limit(1);
    if (!panelinha) throw new Error("Panelinha não encontrada");
    if (panelinha.status !== "ATIVA") throw new Error("A panelinha está inativa");

    const inviterMembership = await this.buscarMembro(panelinhaId, convidadoPorId);
    if (!inviterMembership || inviterMembership.status !== "ATIVO") {
      throw new Error("Apenas membros ativos podem convidar novos atletas");
    }

    let convidado = convidadoPlaynaquadraAtletaId
      ? await this.buscarAtletaAtivoPorPlaynaquadraId(convidadoPlaynaquadraAtletaId)
      : null;

    if (!convidado && convidadoPlaynaquadraAtletaId && convidadoEmail) {
      const localId = await this.upsertAtletaFromPlayCandidate({
        playnaquadraAtletaId: convidadoPlaynaquadraAtletaId,
        nome: convidadoNome || convidadoEmail,
        email: convidadoEmail,
        telefone: convidadoTelefone,
        fotoUrl: convidadoFotoUrl,
      });
      convidado = localId ? await this.buscarAtletaAtivo(localId) : null;
    }

    if (!convidado && convidadoId) convidado = await this.buscarAtletaAtivo(convidadoId);
    convidadoId = normalizeText(convidado?.id || convidadoId);

    if (!convidado) throw new Error("Atleta convidado não encontrado");
    if (convidado.id === convidadoPorId) throw new Error("Você não pode convidar a si mesmo");
    if (!isEligibleRealAthlete(convidado)) {
      throw new Error("Apenas atletas com perfil real, email valido e nao temporario podem ser convidados");
    }

    const member = await this.buscarMembro(panelinhaId, convidadoId);
    if (member?.status === "ATIVO") {
      throw new Error("Este atleta já participa da panelinha");
    }

    const existingInvite = await db
      .select({ id: panelinhaConvites.id })
      .from(panelinhaConvites)
      .innerJoin(usuarios, eq(usuarios.id, panelinhaConvites.convidadoId))
      .where(
        and(
          eq(panelinhaConvites.panelinhaId, panelinhaId),
          or(
            eq(panelinhaConvites.convidadoId, convidadoId),
            convidadoPlaynaquadraAtletaId ? eq(usuarios.playnaquadraAtletaId, convidadoPlaynaquadraAtletaId) : sql`false`
          ),
          eq(panelinhaConvites.status, "PENDENTE")
        )
      )
      .limit(1);
    if (existingInvite.length > 0) throw new Error("Já existe um convite pendente para este atleta");

    const [invite] = await db
      .insert(panelinhaConvites)
      .values({
        panelinhaId,
        convidadoId,
        convidadoPorId,
        status: "PENDENTE",
      })
      .returning();

    return invite;
  }

  async aceitarConvite(conviteId: string, atletaId: string) {
    const conviteKey = normalizeText(conviteId);
    if (!conviteKey) throw new Error("Convite inválido");

    const [invite] = await db.select().from(panelinhaConvites).where(eq(panelinhaConvites.id, conviteKey)).limit(1);
    if (!invite) throw new Error("Convite não encontrado");
    if (invite.convidadoId !== atletaId) throw new Error("Você não pode aceitar um convite de outro atleta");
    if (invite.status !== "PENDENTE") throw new Error("Este convite não está mais pendente");

    const [panelinha] = await db.select().from(panelinhas).where(eq(panelinhas.id, invite.panelinhaId)).limit(1);
    if (!panelinha) throw new Error("Panelinha não encontrada");
    if (panelinha.status !== "ATIVA") throw new Error("A panelinha está inativa");

    await this.buscarAtletaAtivo(atletaId, true);

    const accepted = await db.transaction(async (tx) => {
      const existingMember = await tx
        .select()
        .from(panelinhaMembros)
        .where(and(eq(panelinhaMembros.panelinhaId, invite.panelinhaId), eq(panelinhaMembros.atletaId, atletaId)))
        .limit(1);

      if (existingMember[0]) {
        await tx
          .update(panelinhaMembros)
          .set({
            status: "ATIVO",
            papel: existingMember[0].papel === "FUNDADOR" ? "FUNDADOR" : "MEMBRO",
            convidadoPorId: invite.convidadoPorId,
            saiuEm: null,
            entrouEm: existingMember[0].entrouEm ?? new Date(),
            atualizadoEm: new Date(),
          })
          .where(eq(panelinhaMembros.id, existingMember[0].id));
      } else {
        await tx.insert(panelinhaMembros).values({
          panelinhaId: invite.panelinhaId,
          atletaId,
          papel: "MEMBRO",
          status: "ATIVO",
          convidadoPorId: invite.convidadoPorId,
        });
      }

      const [updatedInvite] = await tx
        .update(panelinhaConvites)
        .set({
          status: "ACEITO",
          respondidoEm: new Date(),
          atualizadoEm: new Date(),
        })
        .where(eq(panelinhaConvites.id, invite.id))
        .returning();

      return updatedInvite;
    });

    return accepted;
  }

  async listarPlays(panelinhaId: string, atletaId: string) {
    const panelinhaKey = normalizeText(panelinhaId);
    if (!panelinhaKey) throw new Error("Panelinha inválida");

    const member = await this.buscarMembro(panelinhaKey, atletaId);
    if (!member || member.status !== "ATIVO") throw new Error("Você não participa desta panelinha");

    const plays = await db
      .select({
        id: panelinhaPlays.id,
        dataHorario: panelinhaPlays.dataHorario,
        quadra: panelinhaPlays.quadra,
        arenaNome: panelinhaPlays.arenaNome,
        status: panelinhaPlays.status,
        formato: panelinhaPlays.formato,
        organizadorId: panelinhaPlays.organizadorId,
      })
      .from(panelinhaPlays)
      .where(eq(panelinhaPlays.panelinhaId, panelinhaKey))
      .orderBy(desc(panelinhaPlays.dataHorario), desc(panelinhaPlays.criadoEm))
      .limit(100);

    const playIds = Array.from(new Set(plays.map((p) => p.id))).filter(Boolean) as string[];

    const participantesCount =
      playIds.length > 0
        ? await db
            .select({
              playId: panelinhaPlayParticipantes.playId,
              total: sql<number>`count(*)::int`,
            })
            .from(panelinhaPlayParticipantes)
            .where(and(inArray(panelinhaPlayParticipantes.playId, playIds), eq(panelinhaPlayParticipantes.status, "ATIVO")))
            .groupBy(panelinhaPlayParticipantes.playId)
        : [];

    const jogosCount =
      playIds.length > 0
        ? await db
            .select({
              playId: panelinhaPlayJogos.playId,
              total: sql<number>`count(*)::int`,
              finalizados: sql<number>`sum(case when ${panelinhaPlayJogos.status} = 'FINALIZADO' then 1 else 0 end)::int`,
            })
            .from(panelinhaPlayJogos)
            .where(inArray(panelinhaPlayJogos.playId, playIds))
            .groupBy(panelinhaPlayJogos.playId)
        : [];

    const participantesMap = new Map(participantesCount.map((r) => [r.playId, Number(r.total || 0)]));
    const jogosMap = new Map(jogosCount.map((r) => [r.playId, { total: Number(r.total || 0), finalizados: Number(r.finalizados || 0) }]));

    return plays.map((p) => ({
      ...p,
      totalParticipantes: participantesMap.get(p.id) ?? 0,
      totalJogos: jogosMap.get(p.id)?.total ?? 0,
      jogosFinalizados: jogosMap.get(p.id)?.finalizados ?? 0,
    }));
  }

  async obterPlayDetalhes(panelinhaId: string, playId: string, atletaId: string) {
    const panelinhaKey = normalizeText(panelinhaId);
    const playKey = normalizeText(playId);
    if (!panelinhaKey) throw new Error("Panelinha inválida");
    if (!playKey) throw new Error("Play inválido");

    const member = await this.buscarMembro(panelinhaKey, atletaId);
    if (!member || member.status !== "ATIVO") throw new Error("Você não participa desta panelinha");

    const [play] = await db
      .select()
      .from(panelinhaPlays)
      .where(and(eq(panelinhaPlays.id, playKey), eq(panelinhaPlays.panelinhaId, panelinhaKey)))
      .limit(1);
    if (!play) throw new Error("Play não encontrado");

    const participantes = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        fotoUrl: usuarios.fotoUrl,
        status: panelinhaPlayParticipantes.status,
      })
      .from(panelinhaPlayParticipantes)
      .innerJoin(usuarios, eq(panelinhaPlayParticipantes.atletaId, usuarios.id))
      .where(and(eq(panelinhaPlayParticipantes.playId, playKey), eq(panelinhaPlayParticipantes.status, "ATIVO")))
      .orderBy(asc(usuarios.nome));

    const jogos = await db
      .select()
      .from(panelinhaPlayJogos)
      .where(eq(panelinhaPlayJogos.playId, playKey))
      .orderBy(asc(panelinhaPlayJogos.ordem));

    return {
      ...play,
      participantes,
      jogos,
      locked: jogos.some((j) => j.status === "FINALIZADO" || (j.detalhesPlacar as any)?.length > 0),
      meuPapel: member.papel,
    };
  }

  async criarPlay(panelinhaId: string, organizadorId: string, dados: CriarPanelinhaPlayDTO) {
    const panelinhaKey = normalizeText(panelinhaId);
    if (!panelinhaKey) throw new Error("Panelinha inválida");

    const agendamentoId = normalizeText(dados.agendamentoId);
    if (!agendamentoId) throw new Error("Agendamento inválido");

    const dataHorario = parseDateTime(dados.dataHorario);
    const formato = dados.formato;
    if (formato !== "SUPER4" && formato !== "CONFRONTO_LIVRE") throw new Error("Formato inválido");

    const [panelinha] = await db.select().from(panelinhas).where(eq(panelinhas.id, panelinhaKey)).limit(1);
    if (!panelinha) throw new Error("Panelinha não encontrada");
    if (panelinha.status !== "ATIVA") throw new Error("A panelinha está inativa");

    const organizador = await this.buscarMembro(panelinhaKey, organizadorId);
    if (!organizador || organizador.status !== "ATIVO") throw new Error("Apenas membros ativos podem criar um play");

    const participantes = uniqIds(dados.participantes || []);
    const participantesComOrganizador = uniqIds([organizadorId, ...participantes]);

    if (formato === "SUPER4") {
      if (participantesComOrganizador.length !== 4) throw new Error("Super 4 precisa de 4 participantes");
    } else {
      if (participantesComOrganizador.length < 4) throw new Error("Confronto livre precisa de pelo menos 4 participantes");
    }

    const membrosAtivos = await db
      .select({ atletaId: panelinhaMembros.atletaId })
      .from(panelinhaMembros)
      .where(and(eq(panelinhaMembros.panelinhaId, panelinhaKey), eq(panelinhaMembros.status, "ATIVO")));
    const membrosSet = new Set(membrosAtivos.map((m) => m.atletaId));
    for (const pid of participantesComOrganizador) {
      if (!membrosSet.has(pid)) throw new Error("Todos os participantes devem ser membros da mesma panelinha");
    }

    const jogos =
      formato === "SUPER4"
        ? buildSuper4Jogos(participantesComOrganizador as [string, string, string, string])
        : (dados.jogos || []).map((j, idx) => ({ ordem: idx + 1, ...validateJogo(j) }));

    if (formato === "CONFRONTO_LIVRE" && jogos.length === 0) {
      throw new Error("Informe pelo menos um jogo para confronto livre");
    }

    for (const j of jogos) {
      const ids = [j.duplaAAtleta1Id, j.duplaAAtleta2Id, j.duplaBAtleta1Id, j.duplaBAtleta2Id];
      for (const pid of ids) {
        if (!membrosSet.has(pid)) throw new Error("Todos os participantes do jogo devem ser membros da panelinha");
      }
      for (const pid of ids) {
        if (!participantesComOrganizador.includes(pid)) {
          throw new Error("Todos os atletas do jogo devem estar na lista de participantes do play");
        }
      }
    }

    const created = await db.transaction(async (tx) => {
      const [playRow] = await tx
        .insert(panelinhaPlays)
        .values({
          panelinhaId: panelinhaKey,
          organizadorId,
          agendamentoId,
          dataHorario,
          quadra: dados.quadra ? normalizeText(dados.quadra) : null,
          arenaNome: dados.arenaNome ? normalizeText(dados.arenaNome) : null,
          status: "ABERTO",
          formato,
          config: null,
          atualizadoEm: new Date(),
        })
        .returning();

      const participanteRows: (typeof panelinhaPlayParticipantes.$inferInsert)[] = participantesComOrganizador.map((atletaId) => ({
        playId: playRow.id,
        atletaId,
        status: "ATIVO",
        entrouEm: new Date(),
        atualizadoEm: new Date(),
      }));

      await tx.insert(panelinhaPlayParticipantes).values(participanteRows);

      const jogoRows: (typeof panelinhaPlayJogos.$inferInsert)[] = jogos.map((j) => ({
        playId: playRow.id,
        ordem: j.ordem,
        duplaAAtleta1Id: j.duplaAAtleta1Id,
        duplaAAtleta2Id: j.duplaAAtleta2Id,
        duplaBAtleta1Id: j.duplaBAtleta1Id,
        duplaBAtleta2Id: j.duplaBAtleta2Id,
        status: "PENDENTE",
        detalhesPlacar: null,
        registradoPorId: null,
        registradoEm: null,
        atualizadoEm: new Date(),
      }));

      await tx.insert(panelinhaPlayJogos).values(jogoRows);

      return playRow;
    });

    return created;
  }

  async registrarResultadoPlayJogo(panelinhaId: string, playId: string, jogoId: string, atletaId: string, dados: RegistrarResultadoPanelinhaPlayJogoDTO) {
    const panelinhaKey = normalizeText(panelinhaId);
    const playKey = normalizeText(playId);
    const jogoKey = normalizeText(jogoId);
    if (!panelinhaKey) throw new Error("Panelinha inválida");
    if (!playKey) throw new Error("Play inválido");
    if (!jogoKey) throw new Error("Jogo inválido");

    const member = await this.buscarMembro(panelinhaKey, atletaId);
    if (!member || member.status !== "ATIVO") throw new Error("Você não participa desta panelinha");

    const [play] = await db
      .select()
      .from(panelinhaPlays)
      .where(and(eq(panelinhaPlays.id, playKey), eq(panelinhaPlays.panelinhaId, panelinhaKey)))
      .limit(1);
    if (!play) throw new Error("Play não encontrado");
    if (play.status !== "ABERTO") throw new Error("Play não está aberto para resultados");

    const participante = await db
      .select({ id: panelinhaPlayParticipantes.id })
      .from(panelinhaPlayParticipantes)
      .where(and(eq(panelinhaPlayParticipantes.playId, playKey), eq(panelinhaPlayParticipantes.atletaId, atletaId), eq(panelinhaPlayParticipantes.status, "ATIVO")))
      .limit(1);
    if (!participante[0]) throw new Error("Apenas participantes do play podem registrar resultado");

    const [jogo] = await db
      .select()
      .from(panelinhaPlayJogos)
      .where(and(eq(panelinhaPlayJogos.id, jogoKey), eq(panelinhaPlayJogos.playId, playKey)))
      .limit(1);
    if (!jogo) throw new Error("Jogo não encontrado");
    if (jogo.status === "FINALIZADO") throw new Error("Este jogo já possui resultado");

    const regras = {
      tipo: "SETS" as const,
      melhorDe: 1 as const,
      gamesPorSet: 6 as const,
      tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
    };

    const calculated = calcularResultadoSets({
      regras,
      equipeAId: "A",
      equipeBId: "B",
      detalhesPlacar: dados.detalhesPlacar,
    });

    const [updated] = await db
      .update(panelinhaPlayJogos)
      .set({
        status: "FINALIZADO",
        detalhesPlacar: calculated.detalhesPlacar as any,
        registradoPorId: atletaId,
        registradoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(panelinhaPlayJogos.id, jogo.id))
      .returning();

    return updated;
  }

  async atualizarPlay(panelinhaId: string, playId: string, solicitanteId: string, dados: AtualizarPanelinhaPlayDTO) {
    const panelinhaKey = normalizeText(panelinhaId);
    const playKey = normalizeText(playId);
    if (!panelinhaKey) throw new Error("Panelinha inválida");
    if (!playKey) throw new Error("Play inválido");

    const member = await this.buscarMembro(panelinhaKey, solicitanteId);
    if (!member || member.status !== "ATIVO") throw new Error("Você não participa desta panelinha");

    const [play] = await db
      .select()
      .from(panelinhaPlays)
      .where(and(eq(panelinhaPlays.id, playKey), eq(panelinhaPlays.panelinhaId, panelinhaKey)))
      .limit(1);
    if (!play) throw new Error("Play não encontrado");
    if (play.organizadorId !== solicitanteId) throw new Error("Apenas o organizador pode ajustar o play");
    if (play.status !== "ABERTO") throw new Error("Play não está aberto para ajustes");

    const lockedRow = await db
      .select({ id: panelinhaPlayJogos.id })
      .from(panelinhaPlayJogos)
      .where(
        and(
          eq(panelinhaPlayJogos.playId, playKey),
          or(eq(panelinhaPlayJogos.status, "FINALIZADO"), sql`${panelinhaPlayJogos.detalhesPlacar} is not null`)
        )
      )
      .limit(1);
    if (lockedRow[0]) throw new Error("Play não pode ser ajustado: já existe resultado registrado");

    const nextFormato = dados.formato ?? (play.formato as any);
    if (nextFormato !== "SUPER4" && nextFormato !== "CONFRONTO_LIVRE") throw new Error("Formato inválido");

    const nextDataHorario = dados.dataHorario ? parseDateTime(dados.dataHorario) : null;
    const nextQuadra = dados.quadra !== undefined ? (dados.quadra ? normalizeText(dados.quadra) : null) : undefined;
    const nextArenaNome = dados.arenaNome !== undefined ? (dados.arenaNome ? normalizeText(dados.arenaNome) : null) : undefined;

    const updateParticipantes = Array.isArray(dados.participantes);
    const nextParticipantesRaw = updateParticipantes ? uniqIds(dados.participantes || []) : null;
    const nextParticipantes = updateParticipantes ? uniqIds([solicitanteId, ...(nextParticipantesRaw || [])]) : null;

    if (updateParticipantes) {
      if (nextFormato === "SUPER4") {
        if ((nextParticipantes || []).length !== 4) throw new Error("Super 4 precisa de 4 participantes");
      } else {
        if ((nextParticipantes || []).length < 4) throw new Error("Confronto livre precisa de pelo menos 4 participantes");
      }

      const membrosAtivos = await db
        .select({ atletaId: panelinhaMembros.atletaId })
        .from(panelinhaMembros)
        .where(and(eq(panelinhaMembros.panelinhaId, panelinhaKey), eq(panelinhaMembros.status, "ATIVO")));
      const membrosSet = new Set(membrosAtivos.map((m) => m.atletaId));
      for (const pid of nextParticipantes || []) {
        if (!membrosSet.has(pid)) throw new Error("Todos os participantes devem ser membros da mesma panelinha");
      }
    }

    const updateJogos = dados.jogos !== undefined;

    const updated = await db.transaction(async (tx) => {
      if (updateParticipantes && nextParticipantes) {
        const existing = await tx
          .select()
          .from(panelinhaPlayParticipantes)
          .where(eq(panelinhaPlayParticipantes.playId, playKey));

        const existingByAtleta = new Map(existing.map((r) => [r.atletaId, r]));
        const nextSet = new Set(nextParticipantes);

        for (const row of existing) {
          const shouldBeActive = nextSet.has(row.atletaId);
          if (shouldBeActive && row.status !== "ATIVO") {
            await tx
              .update(panelinhaPlayParticipantes)
              .set({ status: "ATIVO", saiuEm: null, entrouEm: row.entrouEm ?? new Date(), atualizadoEm: new Date() })
              .where(eq(panelinhaPlayParticipantes.id, row.id));
          } else if (!shouldBeActive && row.status === "ATIVO") {
            await tx
              .update(panelinhaPlayParticipantes)
              .set({ status: "REMOVIDO", saiuEm: new Date(), atualizadoEm: new Date() })
              .where(eq(panelinhaPlayParticipantes.id, row.id));
          }
        }

        const toInsert = nextParticipantes.filter((id) => !existingByAtleta.has(id));
        if (toInsert.length > 0) {
          const rows: (typeof panelinhaPlayParticipantes.$inferInsert)[] = toInsert.map((atletaId) => ({
            playId: playKey,
            atletaId,
            status: "ATIVO",
            entrouEm: new Date(),
            atualizadoEm: new Date(),
          }));

          await tx.insert(panelinhaPlayParticipantes).values(rows);
        }
      }

      if (dados.formato && dados.formato !== play.formato) {
        await tx.update(panelinhaPlays).set({ formato: nextFormato as any, atualizadoEm: new Date() }).where(eq(panelinhaPlays.id, playKey));
      }

      if (nextDataHorario || nextQuadra !== undefined || nextArenaNome !== undefined) {
        await tx
          .update(panelinhaPlays)
          .set({
            ...(nextDataHorario ? { dataHorario: nextDataHorario } : {}),
            ...(nextQuadra !== undefined ? { quadra: nextQuadra } : {}),
            ...(nextArenaNome !== undefined ? { arenaNome: nextArenaNome } : {}),
            atualizadoEm: new Date(),
          })
          .where(eq(panelinhaPlays.id, playKey));
      }

      if (updateJogos) {
        const participantesAtivos = await tx
          .select({ atletaId: panelinhaPlayParticipantes.atletaId })
          .from(panelinhaPlayParticipantes)
          .where(and(eq(panelinhaPlayParticipantes.playId, playKey), eq(panelinhaPlayParticipantes.status, "ATIVO")));
        const participantesSet = new Set(participantesAtivos.map((p) => p.atletaId));

        const jogos =
          nextFormato === "SUPER4"
            ? (() => {
                const atletas = Array.from(participantesSet).map((id) => normalizeText(id)).filter(Boolean).sort();
                if (atletas.length !== 4) throw new Error("Super 4 precisa de 4 participantes");
                return buildSuper4Jogos(atletas as [string, string, string, string]);
              })()
            : (dados.jogos || []).map((j, idx) => ({ ordem: idx + 1, ...validateJogo(j) }));

        if (nextFormato === "CONFRONTO_LIVRE" && jogos.length === 0) throw new Error("Informe pelo menos um jogo para confronto livre");

        for (const j of jogos) {
          const ids = [j.duplaAAtleta1Id, j.duplaAAtleta2Id, j.duplaBAtleta1Id, j.duplaBAtleta2Id];
          for (const pid of ids) {
            if (!participantesSet.has(pid)) throw new Error("Todos os atletas do jogo devem estar na lista de participantes do play");
          }
        }

        await tx.delete(panelinhaPlayJogos).where(eq(panelinhaPlayJogos.playId, playKey));

        const rows: (typeof panelinhaPlayJogos.$inferInsert)[] = jogos.map((j) => ({
          playId: playKey,
          ordem: j.ordem,
          duplaAAtleta1Id: j.duplaAAtleta1Id,
          duplaAAtleta2Id: j.duplaAAtleta2Id,
          duplaBAtleta1Id: j.duplaBAtleta1Id,
          duplaBAtleta2Id: j.duplaBAtleta2Id,
          status: "PENDENTE",
          detalhesPlacar: null,
          registradoPorId: null,
          registradoEm: null,
          atualizadoEm: new Date(),
        }));

        await tx.insert(panelinhaPlayJogos).values(rows);
      }

      const [fresh] = await tx.select().from(panelinhaPlays).where(eq(panelinhaPlays.id, playKey)).limit(1);
      return fresh;
    });

    return updated;
  }

  async removerMembro(panelinhaId: string, solicitanteId: string, atletaId: string) {
    const panelinhaKey = normalizeText(panelinhaId);
    const atletaKey = normalizeText(atletaId);

    if (!panelinhaKey) throw new Error("Panelinha inválida");
    if (!atletaKey) throw new Error("Membro inválido");
    if (solicitanteId === atletaKey) throw new Error("O fundador não pode remover a si mesmo");

    const [panelinha] = await db.select().from(panelinhas).where(eq(panelinhas.id, panelinhaKey)).limit(1);
    if (!panelinha) throw new Error("Panelinha não encontrada");
    if (panelinha.status !== "ATIVA") throw new Error("A panelinha está inativa");

    const solicitante = await this.buscarMembro(panelinhaKey, solicitanteId);
    if (!solicitante || solicitante.status !== "ATIVO" || solicitante.papel !== "FUNDADOR") {
      throw new Error("Apenas o fundador pode remover membros");
    }

    const membro = await this.buscarMembro(panelinhaKey, atletaKey);
    if (!membro || membro.status !== "ATIVO") throw new Error("Membro não encontrado na panelinha");
    if (membro.papel === "FUNDADOR") throw new Error("O fundador não pode ser removido");

    const [removed] = await db
      .update(panelinhaMembros)
      .set({
        status: "REMOVIDO",
        saiuEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(panelinhaMembros.id, membro.id))
      .returning();

    return removed;
  }

  private async buscarAtletaAtivo(usuarioId: string, throwIfMissing = false) {
    const [user] = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        perfil: usuarios.perfil,
        email: usuarios.email,
        telefone: usuarios.telefone,
        fotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!user || user.perfil !== "ATLETA") {
      if (throwIfMissing) throw new Error("Atleta não encontrado");
      return null;
    }

    return user;
  }

  private async buscarAtletaAtivoPorPlaynaquadraId(playnaquadraAtletaId: string) {
    const playId = normalizeText(playnaquadraAtletaId);
    if (!playId) return null;

    const [user] = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        perfil: usuarios.perfil,
        email: usuarios.email,
        telefone: usuarios.telefone,
        fotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(usuarios)
      .where(eq(usuarios.playnaquadraAtletaId, playId))
      .limit(1);

    if (!user || user.perfil !== "ATLETA") return null;

    return user;
  }

  private async upsertAtletaFromPlayCandidate(params: {
    playnaquadraAtletaId: string;
    nome: string;
    email: string;
    telefone: string | null;
    fotoUrl: string | null;
  }) {
    const playId = normalizeText(params.playnaquadraAtletaId);
    const email = normalizeEmail(params.email);
    const nome = normalizeText(params.nome);
    const telefone = normalizeText(params.telefone) || null;
    const fotoUrl = normalizeText(params.fotoUrl) || null;

    if (!playId || !email) return null;

    const existingByPlay = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.playnaquadraAtletaId, playId))
      .limit(1);

    if (existingByPlay[0]) {
      await db
        .update(usuarios)
        .set({
          nome: nome || email,
          email,
          telefone,
          fotoUrl,
          perfil: "ATLETA",
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, existingByPlay[0].id));
      return existingByPlay[0].id;
    }

    const existingByEmail = await db
      .select({ id: usuarios.id, playnaquadraAtletaId: usuarios.playnaquadraAtletaId })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);

    if (existingByEmail[0]) {
      await db
        .update(usuarios)
        .set({
          nome: nome || email,
          telefone,
          fotoUrl,
          perfil: "ATLETA",
          playnaquadraAtletaId: existingByEmail[0].playnaquadraAtletaId ? existingByEmail[0].playnaquadraAtletaId : playId,
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, existingByEmail[0].id));
      return existingByEmail[0].id;
    }

    const [novo] = await db
      .insert(usuarios)
      .values({
        nome: nome || email,
        email,
        telefone,
        fotoUrl,
        perfil: "ATLETA",
        playnaquadraAtletaId: playId,
        atualizadoEm: new Date(),
      })
      .returning();

    return novo?.id ?? null;
  }

  private async buscarMembro(panelinhaId: string, atletaId: string) {
    const rows = await db
      .select()
      .from(panelinhaMembros)
      .where(and(eq(panelinhaMembros.panelinhaId, panelinhaId), eq(panelinhaMembros.atletaId, atletaId)))
      .limit(1);

    return rows[0] ?? null;
  }
}

export const panelinhasService = new PanelinhasService();
