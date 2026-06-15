import { db } from "@/db";
import { panelinhaConvites, panelinhaMembros, panelinhas, usuarios } from "@/db/schema";
import { and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";

export type CriarPanelinhaDTO = {
  nome: string;
};

export type ConvidarPanelinhaDTO = {
  panelinhaId: string;
  convidadoId: string;
  convidadoPorId: string;
};

function normalizeText(value?: string | null) {
  return String(value || "").trim();
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

  async buscarAtletasParaConvite(panelinhaId: string, atletaId: string, termo: string, limit = 20) {
    const panelinhaKey = normalizeText(panelinhaId);
    const q = normalizeText(termo);
    if (!panelinhaKey) throw new Error("Panelinha inválida");
    if (q.length < 2) return { atletas: [] };

    const member = await this.buscarMembro(panelinhaKey, atletaId);
    if (!member || member.status !== "ATIVO") throw new Error("Apenas membros ativos podem buscar atletas para convite");

    const activeMembers = await db
      .select({ atletaId: panelinhaMembros.atletaId })
      .from(panelinhaMembros)
      .where(and(eq(panelinhaMembros.panelinhaId, panelinhaKey), eq(panelinhaMembros.status, "ATIVO")));
    const activeMemberIds = Array.from(new Set(activeMembers.map((item) => item.atletaId))).filter(Boolean) as string[];

    const pendingInviteRows = await db
      .select({ convidadoId: panelinhaConvites.convidadoId })
      .from(panelinhaConvites)
      .where(and(eq(panelinhaConvites.panelinhaId, panelinhaKey), eq(panelinhaConvites.status, "PENDENTE")));
    const pendingInviteIds = Array.from(new Set(pendingInviteRows.map((item) => item.convidadoId))).filter(Boolean) as string[];

    const atletas = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        fotoUrl: usuarios.fotoUrl,
      })
      .from(usuarios)
      .where(
        and(
          eq(usuarios.perfil, "ATLETA"),
          activeMemberIds.length > 0 ? notInArray(usuarios.id, activeMemberIds) : sql`true`,
          or(ilike(usuarios.nome, `%${q}%`), ilike(usuarios.email, `%${q}%`), ilike(sql`coalesce(${usuarios.telefone}, '')`, `%${q}%`))
        )
      )
      .orderBy(usuarios.nome)
      .limit(Math.min(Math.max(limit, 1), 30));

    const pendingSet = new Set(pendingInviteIds);
    return {
      atletas: atletas.map((item) => ({
        ...item,
        convitePendente: pendingSet.has(item.id),
      })),
    };
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
    const convidadoId = normalizeText(dados.convidadoId);
    const convidadoPorId = normalizeText(dados.convidadoPorId);

    if (!panelinhaId) throw new Error("Panelinha inválida");
    if (!convidadoId) throw new Error("Atleta convidado é obrigatório");
    if (convidadoId === convidadoPorId) throw new Error("Você não pode convidar a si mesmo");

    const [panelinha] = await db.select().from(panelinhas).where(eq(panelinhas.id, panelinhaId)).limit(1);
    if (!panelinha) throw new Error("Panelinha não encontrada");
    if (panelinha.status !== "ATIVA") throw new Error("A panelinha está inativa");

    const inviterMembership = await this.buscarMembro(panelinhaId, convidadoPorId);
    if (!inviterMembership || inviterMembership.status !== "ATIVO") {
      throw new Error("Apenas membros ativos podem convidar novos atletas");
    }

    const convidado = await this.buscarAtletaAtivo(convidadoId);
    if (!convidado) throw new Error("Atleta convidado não encontrado");

    const member = await this.buscarMembro(panelinhaId, convidadoId);
    if (member?.status === "ATIVO") {
      throw new Error("Este atleta já participa da panelinha");
    }

    const existingInvite = await db
      .select({ id: panelinhaConvites.id })
      .from(panelinhaConvites)
      .where(
        and(
          eq(panelinhaConvites.panelinhaId, panelinhaId),
          eq(panelinhaConvites.convidadoId, convidadoId),
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

  private async buscarAtletaAtivo(usuarioId: string, throwIfMissing = false) {
    const [user] = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        perfil: usuarios.perfil,
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
