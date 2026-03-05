import { db } from "@/db";
import { torneios, esportes, usuarios } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

export type CriarTorneioDTO = {
  nome: string;
  slug: string;
  descricao?: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  local: string;
  esporteId: string;
  superCampeonato?: boolean;
  organizadorId?: string;
  bannerUrl?: string;
  logoUrl?: string;
  templateUrl?: string;
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
        superCampeonato: torneios.superCampeonato,
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
      bannerUrl: torneios.bannerUrl,
      logoUrl: torneios.logoUrl,
      templateUrl: torneios.templateUrl,
      superCampeonato: torneios.superCampeonato,
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
    }
  ) {
    const [atualizado] = await db
      .update(torneios)
      .set({
        ...dados,
        atualizadoEm: new Date(),
      })
      .where(eq(torneios.slug, slug))
      .returning();

    return atualizado ?? null;
  }

  async excluirPorSlug(slug: string) {
    const [excluido] = await db.delete(torneios).where(eq(torneios.slug, slug)).returning();
    return excluido ?? null;
  }
}

export const torneiosService = new TorneiosService();
