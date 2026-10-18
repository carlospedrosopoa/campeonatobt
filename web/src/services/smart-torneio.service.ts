import { randomInt } from "crypto";
import { db } from "@/db";
import { categorias, equipeIntegrantes, esportes, inscricoes, smartTorneioConfig, smartTorneios, torneios, usuarios } from "@/db/schema";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { gerarPixCopiaCola } from "@/lib/pix";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { categoriaConfigService, defaultCategoriaConfigV1, type CategoriaConfigV1 } from "@/services/categoria-config.service";
import { torneioComunicacoesService } from "@/services/torneio-comunicacoes.service";
import { DEFAULT_REGRAS_PARTIDA_BT } from "@/lib/regras-partida";

/**
 * Smart Torneio: o atleta cria pelo app um torneio privado com uma categoria, paga por Pix
 * (valor por atleta habilitado, com minimo) e o gestor do Play na Quadra autoriza.
 * Por baixo e um torneio comum, oculto, com a operacao ao vivo ligada; o acesso dos atletas e por codigo.
 */

export class ErroSmart extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type StatusSmart = "AGUARDANDO_PAGAMENTO" | "AGUARDANDO_APROVACAO" | "APROVADO" | "RECUSADO";
type Genero = "MASCULINO" | "FEMININO" | "MISTO" | "LIVRE";
type TipoParticipacao = "DUPLAS" | "DUPLAS_SORTEADAS" | "SIMPLES";
type Formato = "GRUPOS" | "MATA_MATA" | "AMERICANO";

const ESPORTE_BEACH_TENNIS = "Beach Tennis";
// sem letras e numeros parecidos (0/O, 1/I/L)
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MIN_ATLETAS = 4;
const MAX_ATLETAS = 64;

export async function obterConfigSmart() {
  const [c] = await db.select().from(smartTorneioConfig).where(eq(smartTorneioConfig.id, 1)).limit(1);
  return {
    valorPorAtleta: Number(c?.valorPorAtleta ?? 5),
    valorMinimo: Number(c?.valorMinimo ?? 40),
    pixChave: c?.pixChave ?? null,
    pixNome: c?.pixNome ?? null,
    pixCidade: c?.pixCidade ?? null,
  };
}

export async function salvarConfigSmart(dados: { valorPorAtleta?: number; valorMinimo?: number; pixChave?: string | null; pixNome?: string | null; pixCidade?: string | null }) {
  const valores = {
    ...(dados.valorPorAtleta != null ? { valorPorAtleta: Math.max(0, Number(dados.valorPorAtleta) || 0).toFixed(2) } : {}),
    ...(dados.valorMinimo != null ? { valorMinimo: Math.max(0, Number(dados.valorMinimo) || 0).toFixed(2) } : {}),
    ...(dados.pixChave !== undefined ? { pixChave: dados.pixChave?.trim() || null } : {}),
    ...(dados.pixNome !== undefined ? { pixNome: dados.pixNome?.trim() || null } : {}),
    ...(dados.pixCidade !== undefined ? { pixCidade: dados.pixCidade?.trim() || null } : {}),
    atualizadoEm: new Date(),
  };
  await db.insert(smartTorneioConfig).values({ id: 1, ...valores }).onConflictDoUpdate({ target: smartTorneioConfig.id, set: valores });
  return obterConfigSmart();
}

/** R$ por atleta habilitado, respeitando o valor minimo. */
export function calcularValorSmart(quantidadeAtletas: number, config: { valorPorAtleta: number; valorMinimo: number }) {
  return Math.max(config.valorMinimo, quantidadeAtletas * config.valorPorAtleta);
}

async function gerarCodigoUnico() {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const codigo = Array.from({ length: 6 }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join("");
    const [existe] = await db.select({ id: smartTorneios.id }).from(smartTorneios).where(eq(smartTorneios.codigo, codigo)).limit(1);
    if (!existe) return codigo;
  }
  throw new ErroSmart("Não foi possível gerar o código do torneio. Tente de novo.", 500);
}

function pixDoPedido(config: Awaited<ReturnType<typeof obterConfigSmart>>, valor: number, codigo: string) {
  if (!config.pixChave || !config.pixNome || !config.pixCidade) return null;
  return gerarPixCopiaCola({
    chave: config.pixChave,
    nome: config.pixNome,
    cidade: config.pixCidade,
    valor,
    txid: `SMART${codigo}`,
    descricao: `Smart Torneio ${codigo}`,
  });
}

export async function criarSmartTorneio(params: {
  criadorUsuarioId: string;
  nome: string;
  data: string; // YYYY-MM-DD
  horario?: string | null; // HH:MM
  local: string;
  genero: Genero;
  tipoParticipacao: TipoParticipacao;
  formato: Formato;
  quantidadeAtletas: number;
  /** Americano: jogos de cada atleta antes da final (padrao 6) */
  jogosPorAtleta?: number;
}) {
  const nome = params.nome?.trim();
  const local = params.local?.trim();
  if (!nome || nome.length < 3) throw new ErroSmart("Informe o nome do torneio");
  if (!local) throw new ErroSmart("Informe o local do torneio");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.data || "")) throw new ErroSmart("Data inválida");
  if (!["MASCULINO", "FEMININO", "MISTO", "LIVRE"].includes(params.genero)) throw new ErroSmart("Gênero inválido");
  const formato: Formato = params.formato === "MATA_MATA" ? "MATA_MATA" : params.formato === "AMERICANO" ? "AMERICANO" : "GRUPOS";
  // no Americano cada atleta se inscreve sozinho e troca de parceiro a cada jogo
  const tipoParticipacao: TipoParticipacao = formato === "AMERICANO" ? "SIMPLES" : params.tipoParticipacao;
  if (!["DUPLAS", "DUPLAS_SORTEADAS", "SIMPLES"].includes(tipoParticipacao)) throw new ErroSmart("Tipo de participação inválido");
  if (formato !== "AMERICANO" && tipoParticipacao === "SIMPLES") throw new ErroSmart("Tipo de participação inválido");
  const quantidade = Math.trunc(Number(params.quantidadeAtletas) || 0);
  if (quantidade < MIN_ATLETAS || quantidade > MAX_ATLETAS) throw new ErroSmart(`A quantidade de atletas deve ficar entre ${MIN_ATLETAS} e ${MAX_ATLETAS}`);
  if (formato !== "AMERICANO" && quantidade % 2 !== 0) throw new ErroSmart("A quantidade de atletas precisa ser par (torneio de duplas)");

  const [criador] = await db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, params.criadorUsuarioId)).limit(1);
  if (!criador) throw new ErroSmart("Atleta não encontrado", 404);

  const config = await obterConfigSmart();
  const valor = calcularValorSmart(quantidade, config);
  const codigo = await gerarCodigoUnico();
  const [esporte] = await db.select({ id: esportes.id }).from(esportes).where(eq(esportes.nome, ESPORTE_BEACH_TENNIS)).limit(1);
  if (!esporte?.id) throw new ErroSmart("Esporte padrão não encontrado", 500);

  const torneio = await torneiosService.criar({
    nome,
    slug: `smart-${codigo.toLowerCase()}`,
    descricao: `Smart Torneio criado por ${criador.nome}`,
    dataInicio: params.data,
    dataFim: params.data,
    local,
    esporteId: String(esporte.id),
    oculto: true,
    operacaoAoVivo: true,
  });
  // criado na hora, com todos no local: a proxima chamada sai sozinha quando a quadra libera
  await db.update(torneios).set({ chamadaAutomatica: true }).where(eq(torneios.id, torneio.id));

  const dataHorario = params.horario && /^\d{2}:\d{2}$/.test(params.horario) ? new Date(`${params.data}T${params.horario}:00-03:00`) : null;
  const categoria = await categoriasService.criar({
    torneioId: torneio.id,
    nome,
    genero: params.genero,
    // vagas = inscricoes: em duplas, cada inscricao e uma dupla; em duplas sorteadas, cada inscricao e um atleta
    vagasMaximas: tipoParticipacao === "DUPLAS" ? quantidade / 2 : quantidade,
    dataHorario,
  });

  const configCategoria: CategoriaConfigV1 =
    formato === "AMERICANO"
      ? {
          ...defaultCategoriaConfigV1,
          tipoParticipacao,
          formato,
          // jogos ate 4 games, sem tie-break (4-3 vale); a final vai a 6 com tie-break
          regrasPartida: { ...DEFAULT_REGRAS_PARTIDA_BT, gamesPorSet: 4, tiebreak: { habilitado: false, em: 4, ate: 5, diffMin: 2 } },
          regrasPartidaPorFase: { FINAL: { ...DEFAULT_REGRAS_PARTIDA_BT } },
          americano: { jogosPorAtleta: Number(params.jogosPorAtleta) > 0 ? Math.min(30, Math.trunc(Number(params.jogosPorAtleta))) : 6, final: true },
        }
      : { ...defaultCategoriaConfigV1, tipoParticipacao, formato };
  await categoriaConfigService.salvar(categoria.id, configCategoria);

  const [pedido] = await db
    .insert(smartTorneios)
    .values({
      torneioId: torneio.id,
      categoriaId: categoria.id,
      criadorUsuarioId: criador.id,
      codigo,
      status: "AGUARDANDO_PAGAMENTO",
      quantidadeAtletas: quantidade,
      valor: valor.toFixed(2),
      pixCopiaCola: pixDoPedido(config, valor, codigo),
    })
    .returning();
  return pedido;
}

type LinhaSmart = typeof smartTorneios.$inferSelect;

async function montarResumo(linhas: LinhaSmart[]) {
  if (linhas.length === 0) return [];
  const tIds = linhas.map((l) => l.torneioId);
  const [ts, cs, contagem, criadores, configSmart] = await Promise.all([
    db.select({ id: torneios.id, nome: torneios.nome, slug: torneios.slug, status: torneios.status, dataInicio: torneios.dataInicio, local: torneios.local }).from(torneios).where(inArray(torneios.id, tIds)),
    db.select({ id: categorias.id, genero: categorias.genero, vagasMaximas: categorias.vagasMaximas, dataHorario: categorias.dataHorario }).from(categorias).where(inArray(categorias.torneioId, tIds)),
    db
      .select({ torneioId: inscricoes.torneioId, total: sql<number>`count(*)::int` })
      .from(inscricoes)
      .where(and(inArray(inscricoes.torneioId, tIds), ne(inscricoes.status, "RECUSADA")))
      .groupBy(inscricoes.torneioId),
    db.select({ id: usuarios.id, nome: usuarios.nome, telefone: usuarios.telefone }).from(usuarios).where(inArray(usuarios.id, linhas.map((l) => l.criadorUsuarioId))),
    obterConfigSmart(),
  ]);
  return Promise.all(
    linhas.map(async (l) => {
      const t = ts.find((x) => x.id === l.torneioId);
      const c = cs.find((x) => x.id === l.categoriaId);
      const config = l.categoriaId ? await categoriaConfigService.obterOuDefault(l.categoriaId) : null;
      return {
        id: l.id,
        codigo: l.codigo,
        status: l.status as StatusSmart,
        valor: Number(l.valor),
        quantidadeAtletas: l.quantidadeAtletas,
        // pedido criado antes de cadastrar a chave Pix: gera com a configuracao atual
        pixCopiaCola: l.pixCopiaCola ?? (l.status === "AGUARDANDO_PAGAMENTO" ? pixDoPedido(configSmart, Number(l.valor), l.codigo) : null),
        pagamentoInformadoEm: l.pagamentoInformadoEm?.toISOString() ?? null,
        aprovadoEm: l.aprovadoEm?.toISOString() ?? null,
        motivoRecusa: l.motivoRecusa,
        criadoEm: l.criadoEm.toISOString(),
        criador: criadores.find((u) => u.id === l.criadorUsuarioId) ?? null,
        torneio: t ? { id: t.id, nome: t.nome, slug: t.slug, status: t.status, data: t.dataInicio, local: t.local } : null,
        categoria: c
          ? {
              id: c.id,
              genero: c.genero,
              tipoParticipacao: config?.tipoParticipacao ?? "DUPLAS",
              formato: config?.formato ?? "GRUPOS",
              vagas: c.vagasMaximas,
              inscricoes: contagem.find((x) => x.torneioId === l.torneioId)?.total ?? 0,
              horario: c.dataHorario?.toISOString() ?? null,
            }
          : null,
      };
    })
  );
}

export type ResumoSmart = Awaited<ReturnType<typeof montarResumo>>[number];

export async function listarSmartDoCriador(usuarioId: string) {
  const linhas = await db.select().from(smartTorneios).where(eq(smartTorneios.criadorUsuarioId, usuarioId)).orderBy(desc(smartTorneios.criadoEm));
  return montarResumo(linhas);
}

export async function listarSmartAdmin(status?: StatusSmart | null) {
  const linhas = await db
    .select()
    .from(smartTorneios)
    .where(status ? eq(smartTorneios.status, status) : undefined)
    .orderBy(desc(smartTorneios.criadoEm))
    .limit(200);
  return montarResumo(linhas);
}

/** O criador avisa que fez o Pix: o pedido vai para a fila do gestor. */
export async function informarPagamentoSmart(params: { id: string; usuarioId: string }) {
  const [l] = await db.select().from(smartTorneios).where(eq(smartTorneios.id, params.id)).limit(1);
  if (!l || l.criadorUsuarioId !== params.usuarioId) throw new ErroSmart("Smart Torneio não encontrado", 404);
  if (l.status !== "AGUARDANDO_PAGAMENTO") throw new ErroSmart("Este pedido já foi enviado para aprovação");
  await db.update(smartTorneios).set({ status: "AGUARDANDO_APROVACAO", pagamentoInformadoEm: new Date(), atualizadoEm: new Date() }).where(eq(smartTorneios.id, l.id));
  return (await montarResumo([{ ...l, status: "AGUARDANDO_APROVACAO", pagamentoInformadoEm: new Date() }]))[0];
}

async function avisarCriador(l: LinhaSmart, titulo: string, mensagem: string, adminId: string) {
  const [t] = await db.select({ nome: torneios.nome }).from(torneios).where(eq(torneios.id, l.torneioId)).limit(1);
  await torneioComunicacoesService
    .criarComunicacao({
      torneioId: l.torneioId,
      torneioNome: t?.nome ?? "Smart Torneio",
      criadoPorId: adminId,
      categoriaId: l.categoriaId,
      titulo,
      mensagem,
      enviarWhatsapp: true,
      publicarNoApp: true,
      usuarioIds: [l.criadorUsuarioId],
    })
    .catch((e) => console.error("[smart-torneio] falha ao avisar o criador", e));
}

/** Gestor do Play na Quadra autoriza: o torneio abre para inscricoes pelo codigo. */
export async function aprovarSmart(params: { id: string; adminId: string }) {
  const [l] = await db.select().from(smartTorneios).where(eq(smartTorneios.id, params.id)).limit(1);
  if (!l) throw new ErroSmart("Smart Torneio não encontrado", 404);
  if (l.status === "APROVADO") throw new ErroSmart("Este Smart Torneio já foi autorizado");
  await db.transaction(async (tx) => {
    await tx
      .update(smartTorneios)
      .set({ status: "APROVADO", aprovadoEm: new Date(), aprovadoPorId: params.adminId, motivoRecusa: null, atualizadoEm: new Date() })
      .where(eq(smartTorneios.id, l.id));
    await tx.update(torneios).set({ status: "ABERTO", atualizadoEm: new Date() }).where(eq(torneios.id, l.torneioId));
  });
  await avisarCriador(
    l,
    "Seu Smart Torneio foi autorizado!",
    `Código do torneio: ${l.codigo}\nCompartilhe com os atletas: no app, em "Entrar em Smart Torneio", eles informam o código e se inscrevem.`,
    params.adminId
  );
}

export async function recusarSmart(params: { id: string; adminId: string; motivo: string }) {
  const [l] = await db.select().from(smartTorneios).where(eq(smartTorneios.id, params.id)).limit(1);
  if (!l) throw new ErroSmart("Smart Torneio não encontrado", 404);
  if (l.status === "APROVADO") throw new ErroSmart("Este Smart Torneio já foi autorizado e não pode ser recusado");
  const motivo = params.motivo?.trim() || "Pagamento não identificado";
  await db.update(smartTorneios).set({ status: "RECUSADO", motivoRecusa: motivo, atualizadoEm: new Date() }).where(eq(smartTorneios.id, l.id));
  await avisarCriador(l, "Seu Smart Torneio não foi autorizado", `Motivo: ${motivo}\nEm caso de dúvida, fale com o Play na Quadra.`, params.adminId);
}

/** Atleta informa o codigo: dados do torneio para ele decidir entrar (so torneios autorizados). */
export async function buscarSmartPorCodigo(codigo: string) {
  const c = (codigo || "").trim().toUpperCase();
  if (!c) throw new ErroSmart("Informe o código");
  const [l] = await db.select().from(smartTorneios).where(eq(smartTorneios.codigo, c)).limit(1);
  if (!l || l.status !== "APROVADO") throw new ErroSmart("Código não encontrado. Confira com quem criou o torneio.", 404);
  const [resumo] = await montarResumo([l]);
  return { ...resumo, pixCopiaCola: null, valor: null };
}

/** Smart Torneio do torneio informado, se houver (para permissao do criador e regras de inscricao). */
export async function smartDoTorneio(torneioId: string) {
  const [l] = await db.select().from(smartTorneios).where(eq(smartTorneios.torneioId, torneioId)).limit(1);
  return l ?? null;
}

/**
 * Regras de inscricao do Smart Torneio: o atleta precisa informar o codigo (o criador nao precisa)
 * e o numero de atletas habilitados e o limite (vagas da categoria).
 */
export async function validarInscricaoSmart(params: { torneioId: string; categoriaId: string; codigo?: string | null; peloCriador?: boolean }) {
  const smart = await smartDoTorneio(params.torneioId);
  if (!smart) return; // torneio comum
  if (smart.status !== "APROVADO") throw new ErroSmart("Este Smart Torneio ainda não foi autorizado", 400);
  if (!params.peloCriador && String(params.codigo ?? "").trim().toUpperCase() !== smart.codigo) {
    throw new ErroSmart("Informe o código do Smart Torneio para se inscrever", 403);
  }
  const [cat] = await db.select({ vagas: categorias.vagasMaximas }).from(categorias).where(eq(categorias.id, params.categoriaId)).limit(1);
  if (cat?.vagas) {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(inscricoes)
      .where(and(eq(inscricoes.categoriaId, params.categoriaId), ne(inscricoes.status, "RECUSADA")));
    if (total >= cat.vagas) throw new ErroSmart("Smart Torneio lotado: todas as vagas habilitadas já foram preenchidas", 409);
  }
}

/** Atletas inscritos pelo criador recebem aviso so no app. */
export async function avisarInscritosPeloCriador(params: { torneioId: string; inscricaoId: string; criadorId: string }) {
  try {
    const smart = await smartDoTorneio(params.torneioId);
    if (!smart) return;
    const [t] = await db.select({ nome: torneios.nome }).from(torneios).where(eq(torneios.id, params.torneioId)).limit(1);
    const [criador] = await db.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, params.criadorId)).limit(1);
    const integrantes = await db
      .select({ usuarioId: equipeIntegrantes.usuarioId })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .where(eq(inscricoes.id, params.inscricaoId));
    const usuarioIds = integrantes.map((i) => i.usuarioId).filter((id) => id !== params.criadorId);
    if (usuarioIds.length === 0) return;
    await torneioComunicacoesService.criarComunicacao({
      torneioId: params.torneioId,
      torneioNome: t?.nome ?? "Smart Torneio",
      criadoPorId: params.criadorId,
      categoriaId: smart.categoriaId,
      titulo: "Você foi inscrito num Smart Torneio",
      mensagem: `${criador?.nome ?? "O organizador"} inscreveu você no torneio ${t?.nome ?? ""}. Veja os detalhes no app Play na Quadra.`,
      // criado na hora, com todos presentes: aviso so pelo app
      enviarWhatsapp: false,
      publicarNoApp: true,
      usuarioIds,
    });
  } catch (e) {
    console.error("[smart-torneio] falha ao avisar inscritos", e);
  }
}
