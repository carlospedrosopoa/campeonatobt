import { db } from "@/db";
import { categorias, inscricoes } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";

export type CategoriaResumoAdmin = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
  criadoEm: Date;
  inscricoesTotal: number;
  inscricoesPendentes: number;
  inscricoesAprovadas: number;
  inscricoesFilaEspera: number;
  inscricoesRecusadas: number;
};

export class DashboardAdminService {
  async resumoCategoriasPorTorneio(torneioId: string) {
    const rows = await db
      .select({
        id: categorias.id,
        torneioId: categorias.torneioId,
        nome: categorias.nome,
        genero: categorias.genero,
        valorInscricao: categorias.valorInscricao,
        vagasMaximas: categorias.vagasMaximas,
        criadoEm: categorias.criadoEm,
        inscricoesTotal: sql<number>`coalesce(count(${inscricoes.id}), 0)::int`,
        inscricoesPendentes: sql<number>`coalesce(sum(case when ${inscricoes.status} = 'PENDENTE' then 1 else 0 end), 0)::int`,
        inscricoesAprovadas: sql<number>`coalesce(sum(case when ${inscricoes.status} = 'APROVADA' then 1 else 0 end), 0)::int`,
        inscricoesFilaEspera: sql<number>`coalesce(sum(case when ${inscricoes.status} = 'FILA_ESPERA' then 1 else 0 end), 0)::int`,
        inscricoesRecusadas: sql<number>`coalesce(sum(case when ${inscricoes.status} = 'RECUSADA' then 1 else 0 end), 0)::int`,
      })
      .from(categorias)
      .leftJoin(inscricoes, eq(inscricoes.categoriaId, categorias.id))
      .where(eq(categorias.torneioId, torneioId))
      .groupBy(categorias.id)
      .orderBy(asc(categorias.nome));

    return rows as unknown as CategoriaResumoAdmin[];
  }
}

export const dashboardAdminService = new DashboardAdminService();

