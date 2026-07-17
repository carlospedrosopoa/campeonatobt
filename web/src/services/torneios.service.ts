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
  torneioAdministradores,
  torneios,
  usuarios,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { torneioAdministradoresService } from "@/services/torneio-administradores.service";
import { slugify } from "@/lib/utils";

export type ModeloTorneio = "NORMAL" | "SUPERCAMPEONATO";

export type CriarTorneioDTO = {
  nome: string;
  slug: string;
  descricao?: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  local: string;
  esporteId: string;
  modeloTorneio?: ModeloTorneio | null;
  superCampeonato?: boolean;
  superCampeonatoFormato?: "2_SET_SUPER_TIE" | "1_SET";
  cardApenasComFotos?: boolean;
  quadrasAtivas?: number;
  oculto?: boolean;
  inscricaoComIa?: boolean;
  valorPrimeiraInscricao?: string | number | null;
  valorInscricaoAdicional?: string | number | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  camisetaOpcoes?: string[] | null;
  organizadorId?: string;
  administradorIds?: string[];
  bannerUrl?: string;
  logoUrl?: string;
  templateUrl?: string;
  templateInscricaoUrl?: string;
};

export type ClonarTorneioDTO = {
  torneioOrigemId: string;
  nome: string;
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

const normalizeModeloTorneio = (value: unknown, superCampeonato?: boolean | null): ModeloTorneio => {
  if (value === "SUPERCAMPEONATO") return "SUPERCAMPEONATO";
  if (value === "NORMAL") return "NORMAL";
  return superCampeonato ? "SUPERCAMPEONATO" : "NORMAL";
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
  private async gerarSlugDisponivel(nome: string, executor: Pick<typeof db, "select"> = db) {
    const base = slugify(nome);
    let slug = base;
    let sufixo = 2;

    while (true) {
      const existente = await executor
        .select({ id: torneios.id })
        .from(torneios)
        .where(eq(torneios.slug, slug))
        .limit(1);

      if (!existente[0]) {
        return slug;
      }

      slug = `${base}-${sufixo}`;
      sufixo += 1;
    }
  }

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
        modeloTorneio: torneios.modeloTorneio,
        superCampeonato: torneios.superCampeonato,
        superCampeonatoFormato: torneios.superCampeonatoFormato,
        cardApenasComFotos: torneios.cardApenasComFotos,
        quadrasAtivas: torneios.quadrasAtivas,
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
      .offset(offset)
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          modeloTorneio: normalizeModeloTorneio(row.modeloTorneio, row.superCampeonato),
        }))
      );
  }

  async listarParaUsuario(user: { id: string; perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA" }, params?: { limit?: number; offset?: number }) {
    if (user.perfil === "ADMIN") {
      return await this.listar(params);
    }

    if (user.perfil !== "ORGANIZADOR") {
      return [];
    }

    const ids = await torneioAdministradoresService.listarTorneioIdsGerenciaveis(user.id);
    if (ids.length === 0) return [];

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
        modeloTorneio: torneios.modeloTorneio,
        superCampeonato: torneios.superCampeonato,
        cardApenasComFotos: torneios.cardApenasComFotos,
        quadrasAtivas: torneios.quadrasAtivas,
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
      .where(inArray(torneios.id, ids))
      .orderBy(desc(torneios.criadoEm))
      .limit(limit)
      .offset(offset)
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          modeloTorneio: normalizeModeloTorneio(row.modeloTorneio, row.superCampeonato),
        }))
      );
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
        modeloTorneio: torneios.modeloTorneio,
        superCampeonato: torneios.superCampeonato,
        superCampeonatoFormato: torneios.superCampeonatoFormato,
        cardApenasComFotos: torneios.cardApenasComFotos,
        quadrasAtivas: torneios.quadrasAtivas,
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
      .offset(offset)
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          modeloTorneio: normalizeModeloTorneio(row.modeloTorneio, row.superCampeonato),
        }))
      );
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
      modeloTorneio: torneios.modeloTorneio,
      superCampeonato: torneios.superCampeonato,
      superCampeonatoFormato: torneios.superCampeonatoFormato,
      cardApenasComFotos: torneios.cardApenasComFotos,
      quadrasAtivas: torneios.quadrasAtivas,
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

    const torneio = resultado[0] || null;
    if (!torneio) return null;
    return {
      ...torneio,
      modeloTorneio: normalizeModeloTorneio(torneio.modeloTorneio, torneio.superCampeonato),
    };
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

    const modeloTorneio = normalizeModeloTorneio(dados.modeloTorneio, dados.superCampeonato);
    const administradorIds = Array.isArray(dados.administradorIds) ? dados.administradorIds : [];
    const extras = await torneioAdministradoresService.validarUsuariosGestao(organizadorId, administradorIds);

    const novoTorneio = await db.transaction(async (tx) => {
      const [criado] = await tx
        .insert(torneios)
        .values({
          ...dados,
          modeloTorneio,
          valorPrimeiraInscricao: normalizeDecimal(dados.valorPrimeiraInscricao),
          valorInscricaoAdicional: normalizeDecimal(dados.valorInscricaoAdicional),
          pixChave: normalizeText(dados.pixChave),
          pixNome: normalizeText(dados.pixNome),
          pixCidade: normalizeText(dados.pixCidade),
          camisetaOpcoes: normalizeStringArray(dados.camisetaOpcoes),
          oculto: dados.oculto ?? false,
          inscricaoComIa: dados.inscricaoComIa ?? false,
          cardApenasComFotos: dados.cardApenasComFotos ?? false,
          quadrasAtivas: Math.max(0, Math.min(20, Number(dados.quadrasAtivas ?? 0) || 0)),
          organizadorId,
          superCampeonato: modeloTorneio === "SUPERCAMPEONATO",
          superCampeonatoFormato: dados.superCampeonatoFormato ?? "2_SET_SUPER_TIE",
          status: "RASCUNHO",
        })
        .returning();

      if (extras.length > 0) {
        await tx.insert(torneioAdministradores).values(
          extras.map((usuarioId) => ({
            torneioId: criado.id,
            usuarioId,
          }))
        );
      }

      return criado;
    });

    return {
      ...novoTorneio,
      modeloTorneio: normalizeModeloTorneio(novoTorneio.modeloTorneio, novoTorneio.superCampeonato),
    };
  }

  async clonarSemInscricoes(dados: ClonarTorneioDTO) {
    const nome = String(dados.nome || "").trim();
    if (!nome) {
      throw new Error("Informe o nome do novo torneio.");
    }

    const origemRows = await db.select().from(torneios).where(eq(torneios.id, dados.torneioOrigemId)).limit(1);
    const origem = origemRows[0];
    if (!origem) {
      throw new Error("Torneio de origem não encontrado.");
    }

    const [categoriasOrigem, configsOrigem, arenasOrigem, patrocinadoresOrigem, apoiadoresOrigem, adminsOrigem] = await Promise.all([
      db.select().from(categorias).where(eq(categorias.torneioId, origem.id)).orderBy(asc(categorias.criadoEm)),
      db
        .select({
          categoriaId: categoriaConfiguracoes.categoriaId,
          versao: categoriaConfiguracoes.versao,
          config: categoriaConfiguracoes.config,
        })
        .from(categoriaConfiguracoes)
        .innerJoin(categorias, eq(categoriaConfiguracoes.categoriaId, categorias.id))
        .where(eq(categorias.torneioId, origem.id)),
      db.select().from(arenas).where(eq(arenas.torneioId, origem.id)).orderBy(asc(arenas.criadoEm)),
      db.select().from(patrocinadores).where(eq(patrocinadores.torneioId, origem.id)).orderBy(asc(patrocinadores.criadoEm)),
      db.select().from(apoiadores).where(eq(apoiadores.torneioId, origem.id)).orderBy(asc(apoiadores.criadoEm)),
      db.select({ usuarioId: torneioAdministradores.usuarioId }).from(torneioAdministradores).where(eq(torneioAdministradores.torneioId, origem.id)),
    ]);

    const novoTorneio = await db.transaction(async (tx) => {
      const slug = await this.gerarSlugDisponivel(nome, tx);
      const [clonado] = await tx
        .insert(torneios)
        .values({
          nome,
          slug,
          descricao: origem.descricao,
          dataInicio: origem.dataInicio,
          dataFim: origem.dataFim,
          local: origem.local,
          status: "RASCUNHO",
          oculto: true,
          inscricaoComIa: origem.inscricaoComIa,
          modeloTorneio: origem.modeloTorneio,
          superCampeonato: origem.superCampeonato,
          superCampeonatoFormato: origem.superCampeonatoFormato,
          cardApenasComFotos: origem.cardApenasComFotos,
          quadrasAtivas: origem.quadrasAtivas,
          painelQuadrasReservas: null,
          valorPrimeiraInscricao: origem.valorPrimeiraInscricao,
          valorInscricaoAdicional: origem.valorInscricaoAdicional,
          pixChave: origem.pixChave,
          pixNome: origem.pixNome,
          pixCidade: origem.pixCidade,
          camisetaOpcoes: origem.camisetaOpcoes,
          esporteId: origem.esporteId,
          organizadorId: origem.organizadorId,
          bannerUrl: origem.bannerUrl,
          logoUrl: origem.logoUrl,
          templateUrl: origem.templateUrl,
          templateInscricaoUrl: origem.templateInscricaoUrl,
        })
        .returning();

      if (adminsOrigem.length > 0) {
        await tx.insert(torneioAdministradores).values(
          adminsOrigem.map((admin) => ({
            torneioId: clonado.id,
            usuarioId: admin.usuarioId,
          }))
        );
      }

      if (arenasOrigem.length > 0) {
        await tx.insert(arenas).values(
          arenasOrigem.map((arena) => ({
            torneioId: clonado.id,
            pointId: arena.pointId,
            nome: arena.nome,
            logoUrl: arena.logoUrl,
          }))
        );
      }

      if (patrocinadoresOrigem.length > 0) {
        await tx.insert(patrocinadores).values(
          patrocinadoresOrigem.map((patrocinador) => ({
            torneioId: clonado.id,
            nome: patrocinador.nome,
            logoUrl: patrocinador.logoUrl,
            siteUrl: patrocinador.siteUrl,
          }))
        );
      }

      if (apoiadoresOrigem.length > 0) {
        await tx.insert(apoiadores).values(
          apoiadoresOrigem.map((apoiador) => ({
            torneioId: clonado.id,
            nome: apoiador.nome,
            logoUrl: apoiador.logoUrl,
            instagram: apoiador.instagram,
            slogan: apoiador.slogan,
            endereco: apoiador.endereco,
            latitude: apoiador.latitude,
            longitude: apoiador.longitude,
            siteUrl: apoiador.siteUrl,
          }))
        );
      }

      const categoriaMap = new Map<string, string>();
      for (const categoria of categoriasOrigem) {
        const [novaCategoria] = await tx
          .insert(categorias)
          .values({
            torneioId: clonado.id,
            nome: categoria.nome,
            slug: categoria.slug,
            genero: categoria.genero,
            valorInscricao: categoria.valorInscricao,
            vagasMaximas: categoria.vagasMaximas,
            dataHorario: categoria.dataHorario,
          })
          .returning();

        categoriaMap.set(categoria.id, novaCategoria.id);
      }

      if (configsOrigem.length > 0) {
        await tx.insert(categoriaConfiguracoes).values(
          configsOrigem.flatMap((config) => {
            const categoriaId = categoriaMap.get(config.categoriaId);
            if (!categoriaId) return [];
            return [
              {
                categoriaId,
                versao: config.versao,
                config: config.config,
              },
            ];
          })
        );
      }

      return clonado;
    });

    return {
      ...novoTorneio,
      modeloTorneio: normalizeModeloTorneio(novoTorneio.modeloTorneio, novoTorneio.superCampeonato),
    };
  }

  async atualizarPorSlug(
    slug: string,
    dados: Partial<Omit<CriarTorneioDTO, "organizadorId">> & {
      status?: "RASCUNHO" | "ABERTO" | "EM_ANDAMENTO" | "FINALIZADO" | "CANCELADO";
      modeloTorneio?: ModeloTorneio | null;
      superCampeonato?: boolean;
      cardApenasComFotos?: boolean;
      quadrasAtivas?: number;
      oculto?: boolean;
      inscricaoComIa?: boolean;
    }
  ) {
    const atual = await this.buscarPorSlug(slug);
    if (!atual) return null;

    const modeloTorneio =
      dados.modeloTorneio !== undefined || dados.superCampeonato !== undefined
        ? normalizeModeloTorneio(dados.modeloTorneio, dados.superCampeonato)
        : undefined;

    const bloqueiaMudancaEstrutural = atual.status !== "RASCUNHO";
    const novoEsporteId = dados.esporteId ?? atual.esporteId ?? null;
    const novoModeloTorneio = modeloTorneio ?? atual.modeloTorneio;
    const novoSuperFormato = dados.superCampeonatoFormato ?? atual.superCampeonatoFormato ?? "2_SET_SUPER_TIE";

    if (bloqueiaMudancaEstrutural) {
      const mudouEsporte = novoEsporteId !== (atual.esporteId ?? null);
      const mudouModelo = novoModeloTorneio !== atual.modeloTorneio;
      const mudouFormatoSuper = novoSuperFormato !== (atual.superCampeonatoFormato ?? "2_SET_SUPER_TIE");

      if (mudouEsporte || mudouModelo || mudouFormatoSuper) {
        throw new Error("Esporte, modelo e formato estrutural do torneio so podem ser alterados enquanto ele estiver em RASCUNHO.");
      }
    }

    const [atualizado] = await db
      .update(torneios)
      .set({
        ...dados,
        modeloTorneio,
        superCampeonato:
          modeloTorneio === undefined
            ? dados.superCampeonato
            : modeloTorneio === "SUPERCAMPEONATO",
        quadrasAtivas:
          dados.quadrasAtivas === undefined ? undefined : Math.max(0, Math.min(20, Number(dados.quadrasAtivas) || 0)),
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

    return atualizado
      ? {
          ...atualizado,
          modeloTorneio: normalizeModeloTorneio(atualizado.modeloTorneio, atualizado.superCampeonato),
        }
      : null;
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
