import { db } from "@/db";
import {
  apoiadores,
  arenas,
  categorias,
  categoriaConfiguracoes,
  equipeIntegrantes,
  equipes,
  esportes,
  grupos,
  grupoEquipes,
  inscricaoPagamentos,
  inscricoes,
  partidas,
  patrocinadores,
  placarSubmissoes,
  rodadas,
  torneios,
  usuarios,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

export type CriarTorneioDTO = {
  nome: string;
  slug: string;
  descricao?: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  local: string;
  esporteId: string;
  superCampeonato?: boolean;
  oculto?: boolean;
  inscricaoComIa?: boolean;
  valorPrimeiraInscricao?: string | number | null;
  valorInscricaoAdicional?: string | number | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  camisetaOpcoes?: string[] | null;
  organizadorId?: string;
  bannerUrl?: string;
  logoUrl?: string;
  templateUrl?: string;
  templateInscricaoUrl?: string;
};

const normalizeDecimal = (value: string | number | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeText = (value: string | null | undefined) => {
  if (value === undefined) return undefined;
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
};

const normalizeStringArray = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  const cleaned = value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 80);
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const item of cleaned) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(item);
  }
  return dedup.length > 0 ? dedup : null;
};

export class TorneiosService {
  async listar(params?: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const offset = Math.max(params?.offset ?? 0, 0);

    return await db
      .select({
        id: torneios.id,
        nome: torneios.nome,
        slug: torneios.slug,
        dataInicio: torneios.dataInicio,
        dataFim: torneios.dataFim,
        local: torneios.local,
        status: torneios.status,
        bannerUrl: torneios.bannerUrl,
        logoUrl: torneios.logoUrl,
        templateUrl: torneios.templateUrl,
        templateInscricaoUrl: torneios.templateInscricaoUrl,
        superCampeonato: torneios.superCampeonato,
        oculto: torneios.oculto,
        inscricaoComIa: torneios.inscricaoComIa,
        valorPrimeiraInscricao: torneios.valorPrimeiraInscricao,
        valorInscricaoAdicional: torneios.valorInscricaoAdicional,
        pixChave: torneios.pixChave,
        pixNome: torneios.pixNome,
        pixCidade: torneios.pixCidade,
        camisetaOpcoes: torneios.camisetaOpcoes,
        esporteNome: esportes.nome,
      })
      .from(torneios)
      .leftJoin(esportes, eq(torneios.esporteId, esportes.id))
      .orderBy(desc(torneios.criadoEm))
      .limit(limit)
      .offset(offset);
  }

  async listarRecentes() {
    return await this.listar({ limit: 10, offset: 0 });
  }

  async listarPublicos(params?: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const offset = Math.max(params?.offset ?? 0, 0);
    return await db
      .select({
        id: torneios.id,
        nome: torneios.nome,
        slug: torneios.slug,
        dataInicio: torneios.dataInicio,
        dataFim: torneios.dataFim,
        local: torneios.local,
        status: torneios.status,
        bannerUrl: torneios.bannerUrl,
        logoUrl: torneios.logoUrl,
        templateUrl: torneios.templateUrl,
        templateInscricaoUrl: torneios.templateInscricaoUrl,
        superCampeonato: torneios.superCampeonato,
        oculto: torneios.oculto,
        inscricaoComIa: torneios.inscricaoComIa,
        valorPrimeiraInscricao: torneios.valorPrimeiraInscricao,
        valorInscricaoAdicional: torneios.valorInscricaoAdicional,
        pixChave: torneios.pixChave,
        pixNome: torneios.pixNome,
        pixCidade: torneios.pixCidade,
        camisetaOpcoes: torneios.camisetaOpcoes,
        esporteNome: esportes.nome,
      })
      .from(torneios)
      .leftJoin(esportes, eq(torneios.esporteId, esportes.id))
      .where(eq(torneios.oculto, false))
      .orderBy(desc(torneios.criadoEm))
      .limit(limit)
      .offset(offset);
  }

  async listarRecentesPublicos() {
    return await this.listarPublicos({ limit: 10, offset: 0 });
  }

  async buscarPorSlug(slug: string) {
    const resultado = await db.select({
      id: torneios.id,
      nome: torneios.nome,
      slug: torneios.slug,
      descricao: torneios.descricao,
      dataInicio: torneios.dataInicio,
      dataFim: torneios.dataFim,
      local: torneios.local,
      status: torneios.status,
      oculto: torneios.oculto,
      inscricaoComIa: torneios.inscricaoComIa,
      bannerUrl: torneios.bannerUrl,
      logoUrl: torneios.logoUrl,
      templateUrl: torneios.templateUrl,
      templateInscricaoUrl: torneios.templateInscricaoUrl,
      superCampeonato: torneios.superCampeonato,
      valorPrimeiraInscricao: torneios.valorPrimeiraInscricao,
      valorInscricaoAdicional: torneios.valorInscricaoAdicional,
      pixChave: torneios.pixChave,
      pixNome: torneios.pixNome,
      pixCidade: torneios.pixCidade,
      camisetaOpcoes: torneios.camisetaOpcoes,
      organizadorId: torneios.organizadorId,
      esporteId: torneios.esporteId,
      esporteNome: esportes.nome
    })
    .from(torneios)
    .leftJoin(esportes, eq(torneios.esporteId, esportes.id))
    .where(eq(torneios.slug, slug))
    .limit(1);

    return resultado[0] || null;
  }

  async buscarOrganizadorPadrao() {
    const resultado = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.perfil, "ADMIN"))
      .orderBy(asc(usuarios.criadoEm))
      .limit(1);

    return resultado[0]?.id ?? null;
  }

  async criar(dados: CriarTorneioDTO) {
    const organizadorId = dados.organizadorId ?? (await this.buscarOrganizadorPadrao());
    if (!organizadorId) {
      throw new Error("Nenhum organizador padrão encontrado");
    }

    const [novoTorneio] = await db.insert(torneios).values({
      ...dados,
      valorPrimeiraInscricao: normalizeDecimal(dados.valorPrimeiraInscricao),
      valorInscricaoAdicional: normalizeDecimal(dados.valorInscricaoAdicional),
      pixChave: normalizeText(dados.pixChave),
      pixNome: normalizeText(dados.pixNome),
      pixCidade: normalizeText(dados.pixCidade),
      camisetaOpcoes: normalizeStringArray(dados.camisetaOpcoes),
      oculto: dados.oculto ?? false,
      inscricaoComIa: dados.inscricaoComIa ?? false,
      organizadorId,
      superCampeonato: dados.superCampeonato ?? false,
      status: 'RASCUNHO'
    }).returning();
    return novoTorneio;
  }

  async atualizarPorSlug(
    slug: string,
    dados: Partial<Omit<CriarTorneioDTO, "organizadorId">> & {
      status?: "RASCUNHO" | "ABERTO" | "EM_ANDAMENTO" | "FINALIZADO" | "CANCELADO";
      superCampeonato?: boolean;
      oculto?: boolean;
      inscricaoComIa?: boolean;
    }
  ) {
    const [atualizado] = await db
      .update(torneios)
      .set({
        ...dados,
        valorPrimeiraInscricao: normalizeDecimal(dados.valorPrimeiraInscricao),
        valorInscricaoAdicional: normalizeDecimal(dados.valorInscricaoAdicional),
        pixChave: normalizeText(dados.pixChave),
        pixNome: normalizeText(dados.pixNome),
        pixCidade: normalizeText(dados.pixCidade),
        camisetaOpcoes: normalizeStringArray((dados as any).camisetaOpcoes),
        atualizadoEm: new Date(),
      })
      .where(eq(torneios.slug, slug))
      .returning();

    return atualizado ?? null;
  }

  async excluirPorSlug(slug: string) {
    const torneio = await this.buscarPorSlug(slug);
    if (!torneio) return null;

    const resCount = await db
      .select({
        count: sql<number>`coalesce(count(*), 0)::int`,
      })
      .from(partidas)
      .where(
        and(
          eq(partidas.torneioId, torneio.id),
          sql`(
            ${partidas.status} in ('FINALIZADA','WO')
            OR ${partidas.vencedorId} is not null
            OR coalesce(jsonb_array_length(${partidas.detalhesPlacar}::jsonb), 0) > 0
            OR coalesce(${partidas.placarA}, 0) > 0
            OR coalesce(${partidas.placarB}, 0) > 0
          )`
        )
      );

    const jogosComResultado = (resCount[0]?.count ?? 0) > 0;
    if (jogosComResultado) {
      throw new Error("Não é possível excluir: existe jogo com resultado informado.");
    }

    await db.transaction(async (tx) => {
      const categoriaRows = await tx.select({ id: categorias.id }).from(categorias).where(eq(categorias.torneioId, torneio.id));
      const categoriaIds = categoriaRows.map((r) => r.id);

      const grupoIds =
        categoriaIds.length > 0
          ? (await tx.select({ id: grupos.id }).from(grupos).where(inArray(grupos.categoriaId, categoriaIds))).map((g) => g.id)
          : [];

      const partidaRows = await tx.select({ id: partidas.id }).from(partidas).where(eq(partidas.torneioId, torneio.id));
      const partidaIds = partidaRows.map((p) => p.id);

      const inscricaoRows = await tx
        .select({ id: inscricoes.id, equipeId: inscricoes.equipeId })
        .from(inscricoes)
        .where(eq(inscricoes.torneioId, torneio.id));
      const inscricaoIds = inscricaoRows.map((i) => i.id);
      const equipeIds = Array.from(new Set(inscricaoRows.map((i) => i.equipeId).filter(Boolean))) as string[];

      if (partidaIds.length > 0) {
        await tx.delete(placarSubmissoes).where(inArray(placarSubmissoes.partidaId, partidaIds));
      }

      await tx.delete(partidas).where(eq(partidas.torneioId, torneio.id));
      await tx.delete(rodadas).where(eq(rodadas.torneioId, torneio.id));

      if (grupoIds.length > 0) {
        await tx.delete(grupoEquipes).where(inArray(grupoEquipes.grupoId, grupoIds));
      }
      if (categoriaIds.length > 0) {
        await tx.delete(grupos).where(inArray(grupos.categoriaId, categoriaIds));
        await tx.delete(categoriaConfiguracoes).where(inArray(categoriaConfiguracoes.categoriaId, categoriaIds));
        await tx.delete(categorias).where(eq(categorias.torneioId, torneio.id));
      }

      await tx.delete(arenas).where(eq(arenas.torneioId, torneio.id));
      await tx.delete(apoiadores).where(eq(apoiadores.torneioId, torneio.id));
      await tx.delete(patrocinadores).where(eq(patrocinadores.torneioId, torneio.id));

      if (inscricaoIds.length > 0) {
        await tx.delete(inscricaoPagamentos).where(inArray(inscricaoPagamentos.inscricaoId, inscricaoIds));
      }

      await tx.delete(inscricoes).where(eq(inscricoes.torneioId, torneio.id));

      if (equipeIds.length > 0) {
        await tx.delete(equipeIntegrantes).where(inArray(equipeIntegrantes.equipeId, equipeIds));
        await tx.delete(equipes).where(inArray(equipes.id, equipeIds));
      }

      await tx.delete(torneios).where(eq(torneios.id, torneio.id));
    });

    return { id: torneio.id };
  }
}

export const torneiosService = new TorneiosService();
