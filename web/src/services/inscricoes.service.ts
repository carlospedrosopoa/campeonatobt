import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricaoPagamentos, inscricoes, torneioAtletaPrefs, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playAtualizarGeneroAtleta, playBuscarAtletas, playGetAtletaById } from "@/services/playnaquadra-client";

type AtletaInscricaoDTO = {
  nome: string;
  email: string;
  telefone?: string;
  playnaquadraAtletaId?: string | null;
  fotoUrl?: string | null;
  camisetaOpcao?: string | null;
  genero?: string | null;
};

export type CriarInscricaoDTO = {
  torneioId: string;
  categoriaId: string;
  equipeNome?: string;
  capitaoPosicao?: "A" | "B";
  atletaA: AtletaInscricaoDTO;
  atletaB?: AtletaInscricaoDTO | null;
  status?: "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA";
};

export type AtualizarInscricaoDTO = {
  torneioId: string;
  categoriaId: string;
  equipeNome?: string | null;
  capitaoPosicao?: "A" | "B";
  atletaA: AtletaInscricaoDTO;
  atletaB?: AtletaInscricaoDTO | null;
  status?: "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA";
};

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeSearchName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeOption(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

type GeneroCategoria = "MASCULINO" | "FEMININO" | "MISTO";
type GeneroAtleta = "MASCULINO" | "FEMININO";
type AtletaGeneroInput = {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  playnaquadraAtletaId?: string | null;
  genero?: string | null;
};

function normalizeGeneroAtleta(value: unknown): GeneroAtleta | null {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (!normalized) return null;
  if (["m", "masculino", "male", "homem"].includes(normalized)) return "MASCULINO";
  if (["f", "feminino", "female", "mulher"].includes(normalized)) return "FEMININO";
  return null;
}

function extractPlayAtletaGenero(payload: any) {
  const source = payload && typeof payload === "object" ? payload : {};
  const nested = [source.atleta, source.usuario, source.user, source.profile].filter((item) => item && typeof item === "object");
  const nome = String(
    source.nome ||
      nested.map((item: any) => item?.nome).find(Boolean) ||
      nested.map((item: any) => item?.name).find(Boolean) ||
      ""
  ).trim();
  const email = normalizeEmail(
    source.email ||
      nested.map((item: any) => item?.email).find(Boolean) ||
      ""
  );
  const telefone = String(
    source.telefone ||
      nested.map((item: any) => item?.telefone).find(Boolean) ||
      nested.map((item: any) => item?.whatsapp).find(Boolean) ||
      ""
  ).trim() || null;
  const playnaquadraAtletaId =
    String(
      source.id ||
        source._id ||
        source.atletaId ||
        source.usuarioId ||
        source.atleta?.id ||
        source.atleta?._id ||
        ""
    ).trim() || null;
  const genero = normalizeGeneroAtleta(
    source.genero ||
      source.sexo ||
      source.gender ||
      source.atleta?.genero ||
      source.atleta?.sexo ||
      source.usuario?.genero ||
      source.usuario?.sexo ||
      source.user?.genero ||
      source.user?.sexo
  );

  return {
    nome: nome || null,
    email: email || null,
    telefone,
    playnaquadraAtletaId,
    genero,
  };
}

async function resolverGeneroAtleta(params: AtletaGeneroInput) {
  const token = await getPlayAdminToken();
  const email = normalizeEmail(params.email);
  const phone = normalizePhone(params.telefone);
  const nome = normalizeSearchName(params.nome);
  const playId = String(params.playnaquadraAtletaId || "").trim();
  const debugAtleta = ` [email=${email || "vazio"} id=${playId || "vazio"}]`;

  async function buscarPerfilPlay() {
    if (playId) {
      const byId = await playGetAtletaById({ token, atletaId: playId });
      if (!byId.res.ok) {
        if (!email) {
          throw new Error(`Falha ao validar o perfil de ${params.nome || email || "atleta"} no Play na Quadra${debugAtleta}`);
        }
      } else {
        return extractPlayAtletaGenero(byId.data);
      }
    }

    if (!email) {
      if (!phone && !nome) {
        throw new Error(`Não foi possível validar o gênero de ${params.nome || "um atleta"}: email não informado`);
      }
    }

    const queries = Array.from(
      new Set(
        [
          email,
          phone,
          phone.length >= 8 ? phone.slice(-8) : "",
          nome,
        ].filter((value) => String(value || "").trim().length >= 2)
      )
    );

    const candidatos: Array<ReturnType<typeof extractPlayAtletaGenero>> = [];
    for (const query of queries) {
      const result = await playBuscarAtletas({ token, q: query, limite: 10 });
      if (!result.res.ok) continue;

      const rawCandidates: any[] = Array.isArray(result.data?.atletas) ? result.data.atletas : Array.isArray(result.data) ? result.data : [];
      candidatos.push(...rawCandidates.map((item) => extractPlayAtletaGenero(item)));
    }

    const unique = new Map<string, ReturnType<typeof extractPlayAtletaGenero>>();
    for (const item of candidatos) {
      const key = String(item.playnaquadraAtletaId || item.email || item.nome || "").trim();
      if (!key || unique.has(key)) continue;
      unique.set(key, item);
    }

    const ranked = Array.from(unique.values())
      .map((item) => {
        let score = 0;
        const candidateEmail = normalizeEmail(item.email);
        const candidatePhone = normalizePhone(item.telefone);
        const candidateName = normalizeSearchName(item.nome);
        if (email && candidateEmail === email) score += 120;
        if (phone && candidatePhone === phone) score += 120;
        if (phone && candidatePhone && candidatePhone.endsWith(phone.slice(-8))) score += 40;
        if (nome && candidateName === nome) score += 80;
        if (nome && candidateName && (candidateName.includes(nome) || nome.includes(candidateName))) score += 30;
        if (item.playnaquadraAtletaId) score += 10;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score);

    const exactMatch = ranked[0]?.item ?? null;
    const exactScore = ranked[0]?.score ?? 0;
    if (!exactMatch?.playnaquadraAtletaId || exactScore <= 0) {
      throw new Error(`Não foi possível localizar o perfil de ${params.nome || email} no Play na Quadra para validar o gênero${debugAtleta}`);
    }

    const byId = await playGetAtletaById({ token, atletaId: exactMatch.playnaquadraAtletaId });
    if (!byId.res.ok) {
      if (exactMatch.genero || exactMatch.nome || exactMatch.email) {
        return exactMatch;
      }
      throw new Error(`Falha ao validar o perfil de ${params.nome || email} no Play na Quadra${debugAtleta}`);
    }

    return extractPlayAtletaGenero(byId.data);
  }

  const generoInformado = normalizeGeneroAtleta(params.genero);
  const perfil = await buscarPerfilPlay();

  if (generoInformado) {
    if (!perfil.playnaquadraAtletaId) {
      throw new Error(`Não foi possível localizar o perfil de ${params.nome || email || "atleta"} no Play na Quadra para atualizar o gênero`);
    }

    if (perfil.genero !== generoInformado) {
      const atualizado = await playAtualizarGeneroAtleta({
        token,
        atletaId: perfil.playnaquadraAtletaId,
        genero: generoInformado,
      });
      if (!atualizado.res.ok) {
        throw new Error(`Falha ao atualizar o gênero de ${perfil.nome || params.nome || email || "atleta"} no Play na Quadra`);
      }
    }

    return {
      nome: perfil.nome || params.nome || email || "atleta",
      genero: generoInformado,
    };
  }

  return {
    nome: perfil.nome || params.nome || email || "atleta",
    genero: perfil.genero,
  };
}

export async function validarGeneroInscricao(params: {
  categoriaGenero: string | null | undefined;
  atletaA: AtletaGeneroInput;
  atletaB?: AtletaGeneroInput | null;
}) {
  const categoriaGenero = String(params.categoriaGenero || "").trim().toUpperCase() as GeneroCategoria;
  if (!["MASCULINO", "FEMININO", "MISTO"].includes(categoriaGenero)) return;

  const atletaA = await resolverGeneroAtleta(params.atletaA);
  const atletaB = params.atletaB ? await resolverGeneroAtleta(params.atletaB) : null;

  if (!atletaA.genero) {
    throw new Error(`Não foi possível validar o gênero de ${atletaA.nome}. Atualize o perfil no Play na Quadra.`);
  }

  if (!atletaB) {
    if (categoriaGenero === "MISTO") {
      throw new Error("A categoria mista exige dois atletas de gêneros diferentes.");
    }
    if (categoriaGenero === "MASCULINO" && atletaA.genero !== "MASCULINO") {
      throw new Error("A categoria masculina aceita apenas atletas do gênero masculino.");
    }
    if (categoriaGenero === "FEMININO" && atletaA.genero !== "FEMININO") {
      throw new Error("A categoria feminina aceita apenas atletas do gênero feminino.");
    }
    return;
  }

  if (!atletaB.genero) {
    throw new Error(`Não foi possível validar o gênero de ${atletaB.nome}. Atualize o perfil no Play na Quadra.`);
  }

  if (categoriaGenero === "MASCULINO" && (atletaA.genero !== "MASCULINO" || atletaB.genero !== "MASCULINO")) {
    throw new Error("A categoria masculina aceita apenas atletas do gênero masculino.");
  }

  if (categoriaGenero === "FEMININO" && (atletaA.genero !== "FEMININO" || atletaB.genero !== "FEMININO")) {
    throw new Error("A categoria feminina aceita apenas atletas do gênero feminino.");
  }

  if (categoriaGenero === "MISTO" && atletaA.genero === atletaB.genero) {
    throw new Error("A categoria mista exige uma atleta do gênero feminino e um atleta do gênero masculino.");
  }
}

export class InscricoesService {
  private async obterContextoCategoria(categoriaId: string, torneioId: string) {
    const cat = await db.select().from(categorias).where(eq(categorias.id, categoriaId)).limit(1);
    const categoria = cat[0];
    if (!categoria || categoria.torneioId !== torneioId) {
      throw new Error("Categoria inválida para o torneio");
    }

    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    const tipoParticipacao = config.tipoParticipacao === "SIMPLES" ? "SIMPLES" : "DUPLAS";
    return { categoria, tipoParticipacao };
  }

  async listarPorCategoria(categoriaId: string) {
    const [config, catRow] = await Promise.all([
      categoriaConfigService.obterOuDefault(categoriaId),
      db
        .select({ genero: categorias.genero, torneioId: categorias.torneioId })
        .from(categorias)
        .where(eq(categorias.id, categoriaId))
        .limit(1),
    ]);
    const tipoParticipacao = config.tipoParticipacao === "SIMPLES" ? "SIMPLES" : "DUPLAS";
    const ehSimples = tipoParticipacao === "SIMPLES";
    const torneioId = catRow[0]?.torneioId;

    const rows = await db
      .select({
        inscricaoId: inscricoes.id,
        status: inscricoes.status,
        dataInscricao: inscricoes.dataInscricao,
        torneioId: inscricoes.torneioId,
        categoriaId: inscricoes.categoriaId,
        equipeId: equipes.id,
        equipeNome: equipes.nome,
        equipeCapitaoUsuarioId: equipes.capitaoUsuarioId,
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaEmail: usuarios.email,
        atletaTelefone: usuarios.telefone,
        atletaPlaynaquadraAtletaId: usuarios.playnaquadraAtletaId,
        atletaFotoUrl: usuarios.fotoUrl,
        atletaCamisetaOpcao: torneioAtletaPrefs.camisetaOpcao,
        atletaPago: inscricaoPagamentos.pago,
        atletaPagamentoStatus: inscricaoPagamentos.status,
        atletaValorDevido: inscricaoPagamentos.valorDevido,
      })
      .from(inscricoes)
      .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .leftJoin(torneioAtletaPrefs, and(eq(torneioAtletaPrefs.torneioId, inscricoes.torneioId), eq(torneioAtletaPrefs.usuarioId, usuarios.id)))
      .leftJoin(inscricaoPagamentos, and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, usuarios.id)))
      .where(eq(inscricoes.categoriaId, categoriaId));

    const equipeIdsSet = new Set<string>();
    for (const r of rows) if (r.equipeId) equipeIdsSet.add(r.equipeId);
    const equipeIds = Array.from(equipeIdsSet);
    const todosIntegrantesPorEquipe = new Map<string, { usuarioId: string; nome: string }[]>();
    if (ehSimples && equipeIds.length > 0) {
      const all = await db
        .select({
          equipeId: equipeIntegrantes.equipeId,
          usuarioId: equipeIntegrantes.usuarioId,
          nome: usuarios.nome,
        })
        .from(equipeIntegrantes)
        .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
        .where(inArray(equipeIntegrantes.equipeId, equipeIds));
      for (const row of all) {
        if (!todosIntegrantesPorEquipe.has(row.equipeId)) todosIntegrantesPorEquipe.set(row.equipeId, []);
        todosIntegrantesPorEquipe.get(row.equipeId)!.push({ usuarioId: row.usuarioId, nome: row.nome });
      }
    }

    const pagamentosPorInscricao = new Map<string, { usuarioId: string; pago: boolean; status?: string | null; valorDevido?: string | null }[]>();
    if (ehSimples && torneioId) {
      const inscIds = Array.from(new Set(rows.map((r) => r.inscricaoId)));
      if (inscIds.length > 0) {
        const pags = await db
          .select({
            inscricaoId: inscricaoPagamentos.inscricaoId,
            usuarioId: inscricaoPagamentos.usuarioId,
            pago: inscricaoPagamentos.pago,
            status: inscricaoPagamentos.status,
            valorDevido: inscricaoPagamentos.valorDevido,
          })
          .from(inscricaoPagamentos)
          .where(inArray(inscricaoPagamentos.inscricaoId, inscIds));
        for (const p of pags) {
          if (!pagamentosPorInscricao.has(p.inscricaoId)) pagamentosPorInscricao.set(p.inscricaoId, []);
          pagamentosPorInscricao.get(p.inscricaoId)!.push({ usuarioId: p.usuarioId, pago: Boolean(p.pago), status: p.status, valorDevido: p.valorDevido });
        }
      }
    }

    type Atleta = {
      id: string;
      nome: string;
      email: string;
      telefone: string | null;
      playnaquadraAtletaId?: string | null;
      fotoUrl: string | null;
      camisetaOpcao?: string | null;
      pago: boolean;
      pagamentoStatus?: string;
      valorDevido?: string | null;
    };
    type Inscricao = {
      id: string;
      status: string;
      dataInscricao: Date;
      equipe: {
        id: string;
        nome: string | null;
        capitaoUsuarioId?: string | null;
        atletas: Atleta[];
      };
    };

    const map = new Map<string, Inscricao>();
    const equipesJáComCapitãoCorrigido = new Set<string>();
    const updatesCapitao: { equipeId: string; capitaoUsuarioId: string | null }[] = [];

    for (const r of rows) {
      const key = r.inscricaoId;
      const atleta: Atleta = {
        id: r.atletaId,
        nome: r.atletaNome,
        email: r.atletaEmail,
        telefone: r.atletaTelefone ?? null,
        playnaquadraAtletaId: r.atletaPlaynaquadraAtletaId ?? null,
        fotoUrl: r.atletaFotoUrl ?? null,
        camisetaOpcao: r.atletaCamisetaOpcao ?? null,
        pagamentoStatus: r.atletaPagamentoStatus ?? (Boolean(r.atletaPago) ? "PAGO" : "PENDENTE"),
        pago: Boolean(r.atletaPago) || r.atletaPagamentoStatus === "PAGO",
        valorDevido: r.atletaValorDevido ?? null,
      };
      const current = map.get(key);
      if (!current) {
        map.set(key, {
          id: r.inscricaoId,
          status: r.status,
          dataInscricao: r.dataInscricao,
          equipe: {
            id: r.equipeId,
            nome: r.equipeNome,
            capitaoUsuarioId: r.equipeCapitaoUsuarioId ?? null,
            atletas: [atleta],
          },
        });
      } else {
        current.equipe.atletas.push(atleta);
      }
    }

    const result = Array.from(map.values());
    for (const item of result) {
      if (ehSimples) {
        const capitãoId = item.equipe.capitaoUsuarioId;
        let atletasOriginaisExibicao: Atleta[] = item.equipe.atletas.slice();
        let preferenciaAtletaSimplesId: string | null = null;

        if (capitãoId) {
          const match = atletasOriginaisExibicao.find((a) => a.id === capitãoId);
          if (match) preferenciaAtletaSimplesId = match.id;
        }
        if (!preferenciaAtletaSimplesId && atletasOriginaisExibicao.length === 1) {
          preferenciaAtletaSimplesId = atletasOriginaisExibicao[0].id;
        }
        if (!preferenciaAtletaSimplesId && todosIntegrantesPorEquipe.get(item.equipe.id)?.length === 1) {
          preferenciaAtletaSimplesId = todosIntegrantesPorEquipe.get(item.equipe.id)![0].usuarioId;
        }

        let pagamentoSimplificado: { usuarioId: string; pago: boolean; status?: string | null; valorDevido?: string | null } | null = null;
        if (torneioId && !preferenciaAtletaSimplesId && atletasOriginaisExibicao.length > 1) {
          const pagsInsc = pagamentosPorInscricao.get(item.id) ?? [];
          const pagsComValor = pagsInsc.filter((p) => p.valorDevido);
          if (pagsComValor.length === 1) {
            pagamentoSimplificado = pagsComValor[0];
            preferenciaAtletaSimplesId = pagamentoSimplificado.usuarioId;
          }
        }

        if (preferenciaAtletaSimplesId) {
          const atletaFinal =
            atletasOriginaisExibicao.find((a) => a.id === preferenciaAtletaSimplesId) ??
            atletasOriginaisExibicao[0];
          if (atletaFinal) {
            item.equipe.atletas = [atletaFinal];
            if (pagamentoSimplificado && pagamentoSimplificado.usuarioId === atletaFinal.id) {
              const status = pagamentoSimplificado.status ?? (pagamentoSimplificado.pago ? "PAGO" : "PENDENTE");
              atletaFinal.pagamentoStatus = status;
              atletaFinal.pago = pagamentoSimplificado.pago || status === "PAGO";
              if (pagamentoSimplificado.valorDevido !== undefined && pagamentoSimplificado.valorDevido !== null) {
                atletaFinal.valorDevido = pagamentoSimplificado.valorDevido;
              }
            }
          }
        } else if (atletasOriginaisExibicao.length > 1) {
          item.equipe.atletas = atletasOriginaisExibicao.slice(0, 1);
        }

        const primeiroNome = (item.equipe.atletas[0]?.nome || "").trim().split(/\s+/)[0];
        item.equipe.nome = primeiroNome || (item.equipe.nome || "Atleta");

        if (!equipesJáComCapitãoCorrigido.has(item.equipe.id)) {
          equipesJáComCapitãoCorrigido.add(item.equipe.id);
          const capitaoDeveria = item.equipe.atletas[0]?.id ?? null;
          if (capitaoDeveria && capitaoDeveria !== item.equipe.capitaoUsuarioId) {
            updatesCapitao.push({ equipeId: item.equipe.id, capitaoUsuarioId: capitaoDeveria });
            item.equipe.capitaoUsuarioId = capitaoDeveria;
          }
        }
      } else {
        const nomeAtual = (item.equipe.nome || "").trim();
        if (!nomeAtual) {
          const nomes = item.equipe.atletas
            .map((a) => (a.nome || "").trim().split(/\s+/)[0])
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
          item.equipe.nome = nomes.length > 0 ? nomes.join("/") : "Equipe";
        }
      }
    }

    if (updatesCapitao.length > 0) {
      const chunks: typeof updatesCapitao[] = [];
      for (let i = 0; i < updatesCapitao.length; i += 100) chunks.push(updatesCapitao.slice(i, i + 100));
      for (const chunk of chunks) {
        await db.transaction(async (tx) => {
          for (const u of chunk) {
            await tx.update(equipes).set({ capitaoUsuarioId: u.capitaoUsuarioId }).where(eq(equipes.id, u.equipeId));
          }
        });
      }
    }

    return result.sort((a, b) => a.dataInscricao.getTime() - b.dataInscricao.getTime());
  }

  async criar(dados: CriarInscricaoDTO) {
    const { categoria, tipoParticipacao } = await this.obterContextoCategoria(dados.categoriaId, dados.torneioId);

    const atletaAEmail = dados.atletaA.email.trim().toLowerCase();
    const atletaBEmail = dados.atletaB?.email?.trim().toLowerCase() || "";
    const exigeDupla = tipoParticipacao === "DUPLAS";

    if (!atletaAEmail) throw new Error("Email do atleta é obrigatório");
    if (exigeDupla && !atletaBEmail) throw new Error("Dados dos dois atletas são obrigatórios");
    if (!exigeDupla && dados.atletaB?.email && atletaAEmail === atletaBEmail) {
      throw new Error("Atletas precisam ser diferentes");
    }
    if (exigeDupla && atletaAEmail === atletaBEmail) throw new Error("Atletas precisam ser diferentes");

    await validarGeneroInscricao({
      categoriaGenero: categoria.genero,
      atletaA: {
        nome: dados.atletaA.nome,
        email: atletaAEmail,
        telefone: dados.atletaA.telefone ?? null,
        playnaquadraAtletaId: dados.atletaA.playnaquadraAtletaId ?? null,
        genero: dados.atletaA.genero ?? null,
      },
      atletaB: exigeDupla && dados.atletaB
        ? {
            nome: dados.atletaB.nome,
            email: atletaBEmail,
            telefone: dados.atletaB.telefone ?? null,
            playnaquadraAtletaId: dados.atletaB.playnaquadraAtletaId ?? null,
            genero: dados.atletaB.genero ?? null,
          }
        : null,
    });

    const atletaAId = await this.upsertAtleta({
      nome: dados.atletaA.nome.trim(),
      email: atletaAEmail,
      telefone: dados.atletaA.telefone?.trim(),
      playnaquadraAtletaId: dados.atletaA.playnaquadraAtletaId ?? null,
      fotoUrl: dados.atletaA.fotoUrl ?? null,
    });

    const atletaBId =
      exigeDupla && dados.atletaB
        ? await this.upsertAtleta({
            nome: dados.atletaB.nome.trim(),
            email: atletaBEmail,
            telefone: dados.atletaB.telefone?.trim(),
            playnaquadraAtletaId: dados.atletaB.playnaquadraAtletaId ?? null,
            fotoUrl: dados.atletaB.fotoUrl ?? null,
          })
        : null;

    if (atletaBId && atletaAId === atletaBId) throw new Error("Atletas precisam ser diferentes");
    const capitaoUsuarioId = dados.capitaoPosicao === "B" && atletaBId ? atletaBId : atletaAId;

    const conflito = await db
      .select({ inscricaoId: inscricoes.id })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .where(and(eq(inscricoes.categoriaId, dados.categoriaId), inArray(equipeIntegrantes.usuarioId, [atletaAId, ...(atletaBId ? [atletaBId] : [])])))
      .limit(1);

    if (conflito.length > 0) {
      throw new Error("Um dos atletas já está inscrito nesta categoria");
    }

    const integranteIds = [atletaAId, ...(atletaBId ? [atletaBId] : [])];
    const equipeId = await this.criarEquipeComIntegrantes(dados.torneioId, dados.equipeNome?.trim(), integranteIds);
    await db.update(equipes).set({ capitaoUsuarioId }).where(eq(equipes.id, equipeId));

    const [torneioRow] = await db
      .select({
        valorPrimeiraInscricao: torneios.valorPrimeiraInscricao,
        valorInscricaoAdicional: torneios.valorInscricaoAdicional,
        camisetaOpcoes: torneios.camisetaOpcoes,
      })
      .from(torneios)
      .where(eq(torneios.id, dados.torneioId))
      .limit(1);

    const camisetaAtletaA = this.normalizeCamisetaOpcao(torneioRow?.camisetaOpcoes, dados.atletaA.camisetaOpcao);
    const camisetaAtletaB = atletaBId ? this.normalizeCamisetaOpcao(torneioRow?.camisetaOpcoes, dados.atletaB?.camisetaOpcao) : null;

    const pagamentosPrevios = await db
      .select({
        usuarioId: inscricaoPagamentos.usuarioId,
        total: sql<number>`coalesce(count(*), 0)::int`,
      })
      .from(inscricaoPagamentos)
      .innerJoin(inscricoes, eq(inscricaoPagamentos.inscricaoId, inscricoes.id))
      .where(and(eq(inscricoes.torneioId, dados.torneioId), inArray(inscricaoPagamentos.usuarioId, integranteIds)))
      .groupBy(inscricaoPagamentos.usuarioId);

    const prevMap = new Map<string, number>(pagamentosPrevios.map((p) => [p.usuarioId, Number(p.total || 0)]));

    const valorCategoria = categoria?.valorInscricao ?? null;
    const valorPrimeira = torneioRow?.valorPrimeiraInscricao ?? null;
    const valorAdicional = torneioRow?.valorInscricaoAdicional ?? null;
    const valorPara = (usuarioId: string) => {
      const jaTem = (prevMap.get(usuarioId) ?? 0) > 0;
      if (!jaTem) return valorPrimeira ?? valorCategoria ?? null;
      return valorAdicional ?? valorCategoria ?? null;
    };

    const [novaInscricao] = await db
      .insert(inscricoes)
      .values({
        torneioId: dados.torneioId,
        categoriaId: dados.categoriaId,
        equipeId,
        status: dados.status ?? "APROVADA",
      })
      .returning();

    await db
      .insert(inscricaoPagamentos)
      .values(
        integranteIds.map((usuarioId) => ({
          inscricaoId: novaInscricao.id,
          usuarioId,
          pago: false,
          valorDevido: valorPara(usuarioId),
        }))
      )
      .onConflictDoNothing();

    await this.salvarPreferenciaCamiseta(dados.torneioId, atletaAId, camisetaAtletaA);
    if (atletaBId) {
      await this.salvarPreferenciaCamiseta(dados.torneioId, atletaBId, camisetaAtletaB);
    }

    return novaInscricao;
  }

  async excluir(inscricaoId: string) {
    const [del] = await db.delete(inscricoes).where(eq(inscricoes.id, inscricaoId)).returning();
    return del ?? null;
  }

  async atualizar(inscricaoId: string, dados: AtualizarInscricaoDTO) {
    const insRow = await db
      .select({
        inscricaoId: inscricoes.id,
        torneioId: inscricoes.torneioId,
        categoriaId: inscricoes.categoriaId,
        equipeId: inscricoes.equipeId,
      })
      .from(inscricoes)
      .where(eq(inscricoes.id, inscricaoId))
      .limit(1);

    const ins = insRow[0];
    if (!ins) throw new Error("Inscrição não encontrada");
    if (ins.torneioId !== dados.torneioId || ins.categoriaId !== dados.categoriaId) {
      throw new Error("Inscrição inválida para a categoria/torneio");
    }

    const { categoria, tipoParticipacao } = await this.obterContextoCategoria(dados.categoriaId, dados.torneioId);
    const atletaAEmail = dados.atletaA.email.trim().toLowerCase();
    const atletaBEmail = dados.atletaB?.email?.trim().toLowerCase() || "";
    const exigeDupla = tipoParticipacao === "DUPLAS";
    if (!atletaAEmail) throw new Error("Email do atleta é obrigatório");
    if (exigeDupla && !atletaBEmail) throw new Error("Dados dos dois atletas são obrigatórios");
    if (exigeDupla && atletaAEmail === atletaBEmail) throw new Error("Atletas precisam ser diferentes");

    await validarGeneroInscricao({
      categoriaGenero: categoria?.genero,
      atletaA: {
        nome: dados.atletaA.nome,
        email: atletaAEmail,
        telefone: dados.atletaA.telefone ?? null,
        playnaquadraAtletaId: dados.atletaA.playnaquadraAtletaId ?? null,
        genero: dados.atletaA.genero ?? null,
      },
      atletaB: exigeDupla && dados.atletaB
        ? {
            nome: dados.atletaB.nome,
            email: atletaBEmail,
            telefone: dados.atletaB.telefone ?? null,
            playnaquadraAtletaId: dados.atletaB.playnaquadraAtletaId ?? null,
            genero: dados.atletaB.genero ?? null,
          }
        : null,
    });

    const atletaAId = await this.upsertAtleta({
      nome: dados.atletaA.nome.trim(),
      email: atletaAEmail,
      telefone: dados.atletaA.telefone?.trim(),
      playnaquadraAtletaId: dados.atletaA.playnaquadraAtletaId ?? null,
      fotoUrl: dados.atletaA.fotoUrl ?? null,
    });

    const atletaBId =
      exigeDupla && dados.atletaB
        ? await this.upsertAtleta({
            nome: dados.atletaB.nome.trim(),
            email: atletaBEmail,
            telefone: dados.atletaB.telefone?.trim(),
            playnaquadraAtletaId: dados.atletaB.playnaquadraAtletaId ?? null,
            fotoUrl: dados.atletaB.fotoUrl ?? null,
          })
        : null;

    if (atletaBId && atletaAId === atletaBId) throw new Error("Atletas precisam ser diferentes");
    const capitaoUsuarioId = dados.capitaoPosicao === "B" && atletaBId ? atletaBId : atletaAId;

    const [torneioRow] = await db
      .select({ camisetaOpcoes: torneios.camisetaOpcoes })
      .from(torneios)
      .where(eq(torneios.id, dados.torneioId))
      .limit(1);

    const camisetaAtletaA = this.normalizeCamisetaOpcao(torneioRow?.camisetaOpcoes, dados.atletaA.camisetaOpcao);
    const camisetaAtletaB = atletaBId ? this.normalizeCamisetaOpcao(torneioRow?.camisetaOpcoes, dados.atletaB?.camisetaOpcao) : null;
    const integranteIds = [atletaAId, ...(atletaBId ? [atletaBId] : [])];

    const conflito = await db
      .select({ inscricaoId: inscricoes.id })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .where(
        and(
          eq(inscricoes.categoriaId, dados.categoriaId),
          sql`${inscricoes.id} <> ${inscricaoId}`,
          inArray(equipeIntegrantes.usuarioId, integranteIds)
        )
      )
      .limit(1);

    if (conflito.length > 0) {
      throw new Error("Um dos atletas já está inscrito nesta categoria");
    }

    await db.update(equipes).set({ capitaoUsuarioId }).where(eq(equipes.id, ins.equipeId));

    if (dados.status) {
      await db.update(inscricoes).set({ status: dados.status }).where(eq(inscricoes.id, inscricaoId));
    }

    await db
      .delete(inscricaoPagamentos)
      .where(and(eq(inscricaoPagamentos.inscricaoId, inscricaoId), sql`${inscricaoPagamentos.usuarioId} not in (${sql.join(integranteIds.map((id) => sql`${id}`), sql`, `)})`));

    await db
      .insert(inscricaoPagamentos)
      .values(integranteIds.map((usuarioId) => ({ inscricaoId, usuarioId, pago: false })))
      .onConflictDoNothing();

    await this.salvarPreferenciaCamiseta(dados.torneioId, atletaAId, camisetaAtletaA);
    if (atletaBId) {
      await this.salvarPreferenciaCamiseta(dados.torneioId, atletaBId, camisetaAtletaB);
    }

    return { ok: true };
  }

  private async upsertAtleta(dados: { nome: string; email: string; telefone?: string; playnaquadraAtletaId?: string | null; fotoUrl?: string | null }) {
    const email = normalizeEmail(dados.email);
    const nome = dados.nome.trim();
    const telefone = dados.telefone?.trim() || null;
    const playId = String(dados.playnaquadraAtletaId || "").trim() || null;

    if (!email) throw new Error("Email do atleta é obrigatório");
    if (!nome) throw new Error("Nome do atleta é obrigatório");

    if (playId) {
      const existingByPlay = await db
        .select({ id: usuarios.id, email: usuarios.email, perfil: usuarios.perfil })
        .from(usuarios)
        .where(eq(usuarios.playnaquadraAtletaId, playId))
        .limit(1);
      if (existingByPlay.length > 0) {
        const athlete = existingByPlay[0];
        if (athlete.perfil !== "ATLETA") throw new Error("Parceiro selecionado está vinculado a um usuário não-atleta");

        const conflictingEmail = await db
          .select({ id: usuarios.id, perfil: usuarios.perfil, playnaquadraAtletaId: usuarios.playnaquadraAtletaId })
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
                telefone,
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
            telefone,
            ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
            atualizadoEm: new Date(),
          })
          .where(eq(usuarios.id, athlete.id));
        return athlete.id;
      }
    }

    const existing = await db
      .select({ id: usuarios.id, perfil: usuarios.perfil, playnaquadraAtletaId: usuarios.playnaquadraAtletaId })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    if (existing.length > 0) {
      const athlete = existing[0];
      if (athlete.perfil !== "ATLETA") throw new Error("Email já está vinculado a um usuário não-atleta");

      if (playId && athlete.playnaquadraAtletaId !== playId) {
        const conflictingPlay = await db
          .select({ id: usuarios.id, perfil: usuarios.perfil })
          .from(usuarios)
          .where(eq(usuarios.playnaquadraAtletaId, playId))
          .limit(1);

        if (conflictingPlay.length > 0 && conflictingPlay[0].id !== athlete.id) {
          if (conflictingPlay[0].perfil !== "ATLETA") {
            throw new Error("Parceiro selecionado está vinculado a um usuário não-atleta");
          }

          await db.transaction(async (tx) => {
            await tx
              .update(usuarios)
              .set({
                playnaquadraAtletaId: null,
                atualizadoEm: new Date(),
              })
              .where(eq(usuarios.id, conflictingPlay[0].id));

            await tx
              .update(usuarios)
              .set({
                nome,
                telefone,
                playnaquadraAtletaId: playId,
                ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
                atualizadoEm: new Date(),
              })
              .where(eq(usuarios.id, athlete.id));
          });

          return athlete.id;
        }
      }

      await db
        .update(usuarios)
        .set({
          nome,
          telefone,
          playnaquadraAtletaId: playId,
          ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, athlete.id));
      return athlete.id;
    }

    const [novo] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        telefone,
        perfil: "ATLETA",
        playnaquadraAtletaId: playId,
        fotoUrl: dados.fotoUrl ?? null,
      })
      .returning();

    return novo.id;
  }

  private async buscarEquipePorIntegrantes(torneioId: string, integranteIds: string[]) {
    const tamanho = integranteIds.length;
    const candidatos = await db
      .select({
        equipeId: equipeIntegrantes.equipeId,
      })
      .from(equipeIntegrantes)
      .innerJoin(equipes, eq(equipeIntegrantes.equipeId, equipes.id))
      .where(and(eq(equipes.torneioId, torneioId), inArray(equipeIntegrantes.usuarioId, integranteIds)))
      .groupBy(equipeIntegrantes.equipeId, equipes.id)
      .having(and(
        sql`count(distinct ${equipeIntegrantes.usuarioId}) = ${tamanho}`,
        sql`(select count(*) from equipe_integrantes ei where ei.equipe_id = ${equipes.id}) = ${tamanho}`
      ))
      .limit(1);

    return candidatos[0]?.equipeId ?? null;
  }

  private normalizeCamisetaOpcao(opcoesTorneio: string[] | null | undefined, value?: string | null) {
    const normalized = normalizeOption(value);
    if (!normalized) return null;

    const opcoes = Array.isArray(opcoesTorneio) ? opcoesTorneio.map((item) => String(item)) : [];
    if (opcoes.length === 0) return normalized;

    const byLower = new Map(opcoes.map((item) => [normalizeOption(item).toLowerCase(), item]));
    const match = byLower.get(normalized.toLowerCase()) ?? null;
    if (!match) {
      throw new Error("Opção de camiseta inválida para este torneio");
    }
    return match;
  }

  private async salvarPreferenciaCamiseta(torneioId: string, usuarioId: string, camisetaOpcao?: string | null) {
    const normalized = normalizeOption(camisetaOpcao);
    if (!normalized) {
      await db
        .delete(torneioAtletaPrefs)
        .where(and(eq(torneioAtletaPrefs.torneioId, torneioId), eq(torneioAtletaPrefs.usuarioId, usuarioId)));
      return;
    }

    await db
      .insert(torneioAtletaPrefs)
      .values({
        torneioId,
        usuarioId,
        camisetaOpcao: normalized,
        atualizadoEm: new Date(),
      })
      .onConflictDoUpdate({
        target: [torneioAtletaPrefs.torneioId, torneioAtletaPrefs.usuarioId],
        set: { camisetaOpcao: normalized, atualizadoEm: new Date() },
      });
  }

  private async criarEquipeComIntegrantes(torneioId: string, nome: string | undefined, integranteIds: string[]) {
    const [equipe] = await db
      .insert(equipes)
      .values({
        torneioId,
        nome: nome || null,
        capitaoUsuarioId: integranteIds[0],
      })
      .returning();

    await db.insert(equipeIntegrantes).values(integranteIds.map((usuarioId) => ({ equipeId: equipe.id, usuarioId })));

    return equipe.id;
  }
}

export const inscricoesService = new InscricoesService();
