import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, equipeIntegrantes, inscricaoPagamentos, inscricoes, partidas, torneios, usuarios } from "@/db/schema";
import { inscricoesService } from "@/services/inscricoes.service";

export type AiToolName =
  | "check_player_registration"
  | "get_available_categories"
  | "validate_partner"
  | "create_tournament_registration";

export type ToolExecutionContext = {
  channel: "whatsapp" | "webchat";
  whatsapp: string;
  contactName?: string | null;
  threadId: string;
  inboundText: string;
  tournamentSlug?: string | null;
  tournamentName?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  identity?: {
    userId?: string | null;
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
  } | null;
};

export type ToolResult = {
  ok: boolean;
  tool: AiToolName;
  status: string;
  message: string;
  data: Record<string, unknown>;
  nextAction?: string;
};

type CheckPlayerRegistrationArgs = {
  whatsapp?: string;
  telefone?: string;
  email?: string;
  athleteUserId?: string;
};

type GetAvailableCategoriesArgs = {
  tournamentId?: string;
  tournamentSlug?: string;
  tournamentQuery?: string;
};

type ValidatePartnerArgs = {
  partnerName?: string;
  partnerWhatsapp?: string;
};

type CreateTournamentRegistrationArgs = {
  tournamentId: string;
  categoryId: string;
  athleteWhatsapp?: string;
  athletePhone?: string;
  athleteEmail?: string;
  athleteUserId?: string;
  partnerId: string;
  teamName?: string;
};

type AthleteRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  fotoUrl: string | null;
  playnaquadraAtletaId: string | null;
};

type AthleteLookupResult = {
  status: "invalid" | "not_found" | "found" | "ambiguous";
  matches: AthleteRow[];
};

export const aiTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_player_registration",
      description: "Verifica se o atleta do atendimento atual já está cadastrado e apto para seguir com a inscrição no torneio, usando WhatsApp, telefone, email ou ID interno.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          whatsapp: {
            type: "string",
            description: "Número de WhatsApp do atleta em formato numérico ou internacional.",
          },
          telefone: {
            type: "string",
            description: "Telefone do atleta quando informado no chat do site.",
          },
          email: {
            type: "string",
            description: "Email do atleta quando informado no chat do site.",
          },
          athleteUserId: {
            type: "string",
            description: "ID interno do atleta quando já conhecido pelo sistema.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_available_categories",
      description: "Lista as categorias abertas para inscrição em um torneio específico, usando ID, slug ou nome aproximado do torneio.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tournamentId: { type: "string", description: "ID interno do torneio, quando conhecido." },
          tournamentSlug: { type: "string", description: "Slug público do torneio, quando conhecido." },
          tournamentQuery: { type: "string", description: "Nome ou trecho do nome do torneio informado pelo atleta." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_partner",
      description: "Verifica se o parceiro informado pelo atleta existe no sistema para compor a dupla.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          partnerName: { type: "string", description: "Nome do parceiro informado pelo atleta." },
          partnerWhatsapp: { type: "string", description: "WhatsApp do parceiro, se o atleta souber." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_tournament_registration",
      description: "Cria a inscrição final da dupla no torneio e retorna dados do Pix Copia e Cola.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tournamentId: { type: "string", description: "ID do torneio." },
          categoryId: { type: "string", description: "ID da categoria escolhida." },
          athleteWhatsapp: { type: "string", description: "WhatsApp do atleta solicitante, quando conhecido." },
          athletePhone: { type: "string", description: "Telefone do atleta solicitante, quando conhecido." },
          athleteEmail: { type: "string", description: "Email do atleta solicitante, quando conhecido." },
          athleteUserId: { type: "string", description: "ID interno do atleta solicitante, quando conhecido." },
          partnerId: { type: "string", description: "ID interno do parceiro validado no sistema." },
          teamName: { type: "string", description: "Nome opcional da dupla." },
        },
        required: ["tournamentId", "categoryId", "partnerId"],
      },
    },
  },
];

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs<T>(input: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return {} as T;
  }
}

function onlyAsciiUpper(value: string, maxLen: number) {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase();
  return normalized.length > maxLen ? normalized.slice(0, maxLen) : normalized;
}

function tlv(id: string, value: string) {
  const v = value ?? "";
  const len = String(v.length).padStart(2, "0");
  return `${id}${len}${v}`;
}

function crc16Ccitt(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function formatAmount(value: string | null | undefined) {
  const raw = (value || "").trim().replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function maskEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return null;
  const [user, domain] = normalized.split("@");
  if (!user || !domain) return null;
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"*".repeat(Math.max(0, user.length - visible.length))}@${domain}`;
}

function maskPhone(phone?: string | null) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function buildPixPayload(params: {
  chave: string;
  nome: string;
  cidade: string;
  txid: string;
  descricao?: string | null;
  valor?: string | null;
}) {
  const merchantAccountInfo = [
    tlv("00", "br.gov.bcb.pix"),
    tlv("01", params.chave.trim()),
    params.descricao ? tlv("02", params.descricao.trim()) : "",
  ].join("");

  const additionalData = tlv("05", params.txid);
  const parts = [
    tlv("00", "01"),
    tlv("26", merchantAccountInfo),
    tlv("52", "0000"),
    tlv("53", "986"),
    params.valor ? tlv("54", params.valor) : "",
    tlv("58", "BR"),
    tlv("59", onlyAsciiUpper(params.nome, 25)),
    tlv("60", onlyAsciiUpper(params.cidade, 15)),
    tlv("62", additionalData),
  ].filter(Boolean);

  const base = parts.join("") + "6304";
  return base + crc16Ccitt(base);
}

async function findAthleteByWhatsapp(whatsappRaw: string) {
  const digits = normalizePhone(whatsappRaw);
  const suffix = digits.length > 11 ? digits.slice(-11) : digits;
  if (!suffix) return { status: "invalid" as const, matches: [] as AthleteRow[] };

  const rows = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      fotoUrl: usuarios.fotoUrl,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
    })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.perfil, "ATLETA"),
        sql`${usuarios.telefone} is not null`,
        sql`regexp_replace(coalesce(${usuarios.telefone}, ''), '\\D', '', 'g') like ${`%${suffix}`}`
      )
    )
    .limit(10);

  const exact = rows.filter((r) => normalizePhone(r.telefone).endsWith(suffix));
  if (exact.length === 1) return { status: "found" as const, matches: exact };
  if (exact.length > 1) return { status: "ambiguous" as const, matches: exact };
  if (rows.length === 1) return { status: "found" as const, matches: rows };
  if (rows.length > 1) return { status: "ambiguous" as const, matches: rows };
  return { status: "not_found" as const, matches: [] as AthleteRow[] };
}

async function findAthleteByEmail(emailRaw: string): Promise<AthleteLookupResult> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { status: "invalid", matches: [] };

  const rows = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      fotoUrl: usuarios.fotoUrl,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
    })
    .from(usuarios)
    .where(and(eq(usuarios.perfil, "ATLETA"), ilike(usuarios.email, email)))
    .limit(10);

  if (rows.length === 1) return { status: "found", matches: rows };
  if (rows.length > 1) return { status: "ambiguous", matches: rows };
  return { status: "not_found", matches: [] };
}

async function findAthleteByUserId(userIdRaw: string): Promise<AthleteLookupResult> {
  const userId = String(userIdRaw || "").trim();
  if (!userId) return { status: "invalid", matches: [] };

  const rows = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      fotoUrl: usuarios.fotoUrl,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
    })
    .from(usuarios)
    .where(and(eq(usuarios.id, userId), eq(usuarios.perfil, "ATLETA")))
    .limit(1);

  if (rows.length === 1) return { status: "found", matches: rows };
  return { status: "not_found", matches: [] };
}

async function findAthleteByIdentity(input: {
  athleteUserId?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
}): Promise<AthleteLookupResult> {
  if (input.athleteUserId) {
    const byUserId = await findAthleteByUserId(input.athleteUserId);
    if (byUserId.status === "found" || byUserId.status === "ambiguous") return byUserId;
  }

  if (input.email) {
    const byEmail = await findAthleteByEmail(input.email);
    if (byEmail.status === "found" || byEmail.status === "ambiguous") return byEmail;
  }

  const phone = input.whatsapp || input.phone;
  if (phone) {
    const byPhone = await findAthleteByWhatsapp(phone);
    if (byPhone.status === "found" || byPhone.status === "ambiguous") return byPhone;
    if (byPhone.status === "not_found") return byPhone;
  }

  return { status: "invalid", matches: [] };
}

function getContextAthleteLookup(context: ToolExecutionContext) {
  return findAthleteByIdentity({
    athleteUserId: context.identity?.userId ?? null,
    email: context.identity?.email ?? null,
    phone: context.identity?.telefone ?? null,
    whatsapp: context.whatsapp || null,
  });
}

function serializeAthleteCandidates(matches: AthleteRow[]) {
  return matches.map((m) => ({
    id: m.id,
    nome: m.nome,
    emailMasked: maskEmail(m.email),
    telefoneMasked: maskPhone(m.telefone),
  }));
}

async function listCategoriesForTournament(params: GetAvailableCategoriesArgs, athleteUserId?: string) {
  const tournamentId = String(params.tournamentId || "").trim();
  const tournamentSlug = String(params.tournamentSlug || "").trim();
  const tournamentQuery = String(params.tournamentQuery || "").trim();

  const filters = [];
  if (tournamentId) filters.push(eq(torneios.id, tournamentId));
  if (tournamentSlug) filters.push(eq(torneios.slug, tournamentSlug));
  if (tournamentQuery) {
    const q = `%${tournamentQuery}%`;
    filters.push(or(ilike(torneios.nome, q), ilike(torneios.slug, q)));
  }

  const whereTournament =
    filters.length > 0 ? and(inArray(torneios.status, ["ABERTO", "EM_ANDAMENTO"]), or(...filters)) : inArray(torneios.status, ["ABERTO", "EM_ANDAMENTO"]);

  const rows = await db
    .select({
      torneioId: torneios.id,
      torneioNome: torneios.nome,
      torneioSlug: torneios.slug,
      torneioDescricao: torneios.descricao,
      torneioStatus: torneios.status,
      torneioInscricaoComIa: torneios.inscricaoComIa,
      categoriaId: categorias.id,
      categoriaNome: categorias.nome,
      categoriaGenero: categorias.genero,
      categoriaValorInscricao: categorias.valorInscricao,
      categoriaVagasMaximas: categorias.vagasMaximas,
      categoriaDataHorario: categorias.dataHorario,
      categoriaPartidasGeradas: sql<number>`count(distinct ${partidas.id})`.as("categoria_partidas_geradas"),
      categoriaInscritos: sql<number>`count(distinct ${inscricoes.id})`.as("categoria_inscritos"),
    })
    .from(torneios)
    .leftJoin(categorias, eq(categorias.torneioId, torneios.id))
    .leftJoin(partidas, eq(partidas.categoriaId, categorias.id))
    .leftJoin(inscricoes, eq(inscricoes.categoriaId, categorias.id))
    .where(and(whereTournament, eq(torneios.inscricaoComIa, true)))
    .groupBy(torneios.id, categorias.id)
    .orderBy(desc(torneios.criadoEm));

  const categoriasJaInscritas = new Set<string>();
  if (athleteUserId) {
    const athleteInscricoes = await db
      .select({ categoriaId: inscricoes.categoriaId })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .where(eq(equipeIntegrantes.usuarioId, athleteUserId));
    for (const row of athleteInscricoes) categoriasJaInscritas.add(row.categoriaId);
  }

  const tournamentMap = new Map<
    string,
    {
      id: string;
      nome: string;
      slug: string;
      descricao: string | null;
      status: string;
      categorias: Array<{
        id: string;
        nome: string;
        genero: string;
        valorInscricao: string | null;
        vagasMaximas: number | null;
        dataHorario: Date | null;
        inscritos: number;
        inscricoesAbertas: boolean;
        jaInscrito: boolean;
      }>;
    }
  >();

  for (const r of rows) {
    const current =
      tournamentMap.get(r.torneioId) ??
      {
        id: r.torneioId,
        nome: r.torneioNome,
        slug: r.torneioSlug,
        descricao: r.torneioDescricao ?? null,
        status: r.torneioStatus,
        categorias: [],
      };

    if (!tournamentMap.has(r.torneioId)) tournamentMap.set(r.torneioId, current);

    if (r.categoriaId) {
      current.categorias.push({
        id: r.categoriaId,
        nome: r.categoriaNome ?? "",
        genero: r.categoriaGenero ?? "",
        valorInscricao: r.categoriaValorInscricao ?? null,
        vagasMaximas: r.categoriaVagasMaximas ?? null,
        dataHorario: r.categoriaDataHorario ?? null,
        inscritos: Number(r.categoriaInscritos || 0),
        inscricoesAbertas: Number(r.categoriaPartidasGeradas || 0) === 0,
        jaInscrito: categoriasJaInscritas.has(r.categoriaId),
      });
    }
  }

  return Array.from(tournamentMap.values());
}

async function buildPixForRegistration(inscricaoId: string, athleteUserId: string) {
  const row = await db
    .select({
      torneioNome: torneios.nome,
      pixChave: torneios.pixChave,
      pixNome: torneios.pixNome,
      pixCidade: torneios.pixCidade,
      categoriaNome: categorias.nome,
      categoriaValorInscricao: categorias.valorInscricao,
      pago: inscricaoPagamentos.pago,
      pagamentoStatus: inscricaoPagamentos.status,
      valorDevido: inscricaoPagamentos.valorDevido,
    })
    .from(inscricoes)
    .innerJoin(torneios, eq(inscricoes.torneioId, torneios.id))
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .leftJoin(
      inscricaoPagamentos,
      and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, athleteUserId))
    )
    .where(eq(inscricoes.id, inscricaoId))
    .limit(1);

  const data = row[0];
  if (!data) return null;

  const pixChave = (data.pixChave || "").trim();
  const pixNome = (data.pixNome || "").trim();
  const pixCidade = (data.pixCidade || "").trim();
  if (!pixChave || !pixNome || !pixCidade) return null;

  const status = data.pagamentoStatus ?? (Boolean(data.pago) ? "PAGO" : "PENDENTE");
  const valor = formatAmount((data.valorDevido ?? data.categoriaValorInscricao) as string | null);
  const txid = onlyAsciiUpper(`INS${inscricaoId.replace(/-/g, "").slice(0, 22)}`, 25);
  const descricao = onlyAsciiUpper(`${data.torneioNome} - ${data.categoriaNome}`, 60);

  return {
    pago: status === "PAGO",
    status,
    valor,
    payload: buildPixPayload({
      chave: pixChave,
      nome: pixNome,
      cidade: pixCidade,
      txid,
      descricao,
      valor,
    }),
  };
}

async function checkPlayerRegistration(args: CheckPlayerRegistrationArgs, context: ToolExecutionContext): Promise<ToolResult> {
  const lookup = await findAthleteByIdentity({
    athleteUserId: args.athleteUserId || context.identity?.userId || null,
    email: args.email || context.identity?.email || null,
    phone: args.telefone || context.identity?.telefone || null,
    whatsapp: args.whatsapp || context.whatsapp || null,
  });

  if (lookup.status === "invalid") {
    return {
      ok: true,
      tool: "check_player_registration",
      status: "missing_identity",
      message: "Ainda nao tenho dados suficientes para localizar seu cadastro.",
      nextAction: "solicitar_email_ou_telefone_do_atleta",
      data: {
        identityHint: {
          email: normalizeEmail(args.email || context.identity?.email || null) || null,
          telefone: normalizePhone(args.telefone || context.identity?.telefone || null) || null,
          whatsapp: normalizePhone(args.whatsapp || context.whatsapp || null) || null,
        },
        signupUrl: "https://atleta.playnaquadra.com.br/criar-conta",
      },
    };
  }

  if (lookup.status === "not_found") {
    return {
      ok: true,
      tool: "check_player_registration",
      status: "not_found",
      message: "Nao encontrei um atleta cadastrado com os dados informados.",
      nextAction: "orientar_cadastro_do_atleta",
      data: {
        email: normalizeEmail(args.email || context.identity?.email || null) || null,
        telefone: normalizePhone(args.telefone || context.identity?.telefone || context.whatsapp || null) || null,
        signupUrl: "https://atleta.playnaquadra.com.br/criar-conta",
      },
    };
  }

  if (lookup.status === "ambiguous") {
    return {
      ok: true,
      tool: "check_player_registration",
      status: "ambiguous",
      message: "Encontrei mais de um atleta com estes dados. Preciso de confirmacao manual.",
      nextAction: "encaminhar_para_atendimento_humano",
      data: {
        candidates: serializeAthleteCandidates(lookup.matches),
      },
    };
  }

  const player = lookup.matches[0];
  const missingFields: string[] = [];
  if (!player.email?.trim()) missingFields.push("email");
  if (!player.playnaquadraAtletaId?.trim()) missingFields.push("perfilPlayNaQuadra");

  return {
    ok: true,
    tool: "check_player_registration",
    status: missingFields.length > 0 ? "missing_data" : "registered",
    message:
      missingFields.length > 0
        ? "Atleta localizado, mas ainda faltam dados para concluir a inscricao."
        : "Atleta localizado e apto para seguir com a inscricao.",
    nextAction: missingFields.length > 0 ? "solicitar_regularizacao_cadastral" : "seguir_para_categorias",
    data: {
      email: player.email,
      telefone: player.telefone,
      player: {
        id: player.id,
        nome: player.nome,
        email: player.email,
        telefone: player.telefone,
        playnaquadraAtletaId: player.playnaquadraAtletaId,
      },
      missingFields,
    },
  };
}

async function getAvailableCategories(args: GetAvailableCategoriesArgs, context: ToolExecutionContext): Promise<ToolResult> {
  const athleteLookup = await getContextAthleteLookup(context);
  const athleteId = athleteLookup.status === "found" ? athleteLookup.matches[0]?.id : undefined;
  const tournaments = await listCategoriesForTournament(
    {
      tournamentId: args.tournamentId,
      tournamentSlug: args.tournamentSlug || context.tournamentSlug || undefined,
      tournamentQuery: args.tournamentQuery || context.tournamentName || undefined,
    },
    athleteId
  );

  if (tournaments.length === 0) {
    return {
      ok: true,
      tool: "get_available_categories",
      status: "not_found",
      message: "Nao encontrei torneios abertos com este identificador.",
      nextAction: "pedir_nome_correto_do_torneio",
      data: {
        filters: {
          tournamentId: args.tournamentId || null,
          tournamentSlug: args.tournamentSlug || context.tournamentSlug || null,
          tournamentQuery: args.tournamentQuery || context.tournamentName || null,
        },
      },
    };
  }

  if (tournaments.length > 1) {
    return {
      ok: true,
      tool: "get_available_categories",
      status: "ambiguous_tournament",
      message: "Encontrei mais de um torneio parecido. Preciso que o atleta confirme qual torneio deseja.",
      nextAction: "pedir_confirmacao_do_torneio",
      data: {
        tournaments: tournaments.map((t) => ({
          id: t.id,
          nome: t.nome,
          slug: t.slug,
          status: t.status,
          totalCategorias: t.categorias.length,
        })),
      },
    };
  }

  const tournament = tournaments[0];
  const categories = tournament.categorias.map((c) => ({
    ...c,
    lotado: c.vagasMaximas !== null && c.inscritos >= c.vagasMaximas,
  }));
  const valoresValidos = categories
    .map((c) => (typeof c.valorInscricao === "string" ? c.valorInscricao.trim() : ""))
    .filter(Boolean);
  const valorUnicoPorAtleta = valoresValidos.length > 0 && new Set(valoresValidos).size === 1 ? valoresValidos[0] : null;

  return {
    ok: true,
    tool: "get_available_categories",
    status: "ok",
    message: "Categorias do torneio localizadas com sucesso.",
    nextAction: "pedir_categoria_ao_atleta",
    data: {
      tournament: {
        id: tournament.id,
        nome: tournament.nome,
        slug: tournament.slug,
        descricao: tournament.descricao,
        status: tournament.status,
      },
      feeSummary: {
        sameFeeForAllCategories: Boolean(valorUnicoPorAtleta),
        amountPerAthlete: valorUnicoPorAtleta,
      },
      categories,
      categoryContext: context.categorySlug
        ? {
            slug: context.categorySlug,
            nome: context.categoryName || null,
          }
        : null,
    },
  };
}

async function validatePartner(args: ValidatePartnerArgs, context: ToolExecutionContext): Promise<ToolResult> {
  const partnerName = String(args.partnerName || "").trim();
  const partnerWhatsapp = normalizePhone(args.partnerWhatsapp);
  const athleteLookup = await getContextAthleteLookup(context);
  const athleteId = athleteLookup.status === "found" ? athleteLookup.matches[0]?.id : null;

  if (!partnerName && !partnerWhatsapp) {
    return {
      ok: false,
      tool: "validate_partner",
      status: "invalid_input",
      message: "E necessario informar ao menos o nome ou o WhatsApp do parceiro.",
      nextAction: "solicitar_nome_ou_whatsapp_do_parceiro",
      data: {},
    };
  }

  const conditions = [];
  if (partnerName) {
    const q = `%${partnerName}%`;
    conditions.push(ilike(usuarios.nome, q), ilike(usuarios.email, q));
  }
  if (partnerWhatsapp) {
    conditions.push(sql`regexp_replace(coalesce(${usuarios.telefone}, ''), '\\D', '', 'g') like ${`%${partnerWhatsapp.slice(-11)}`}`);
  }

  const rows = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      fotoUrl: usuarios.fotoUrl,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
    })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.perfil, "ATLETA"),
        sql`${usuarios.playnaquadraAtletaId} is not null`,
        or(...conditions)
      )
    )
    .limit(10);

  const filtered = rows.filter((row) => row.id !== athleteId);
  if (filtered.length === 0) {
    return {
      ok: true,
      tool: "validate_partner",
      status: "not_found",
      message: "Parceiro nao encontrado no sistema.",
      nextAction: "orientar_cadastro_do_parceiro",
      data: {
        partnerName: partnerName || null,
        partnerWhatsapp: partnerWhatsapp || null,
        partnerSignupUrl: "https://atleta.playnaquadra.com.br/criar-conta",
      },
    };
  }

  if (filtered.length > 1) {
    return {
      ok: true,
      tool: "validate_partner",
      status: "ambiguous",
      message: "Encontrei mais de um parceiro possivel. Preciso que o atleta confirme quem e o parceiro correto.",
      nextAction: "pedir_confirmacao_do_parceiro",
      data: {
        candidates: serializeAthleteCandidates(filtered),
      },
    };
  }

  const partner = filtered[0];
  return {
    ok: true,
    tool: "validate_partner",
    status: "valid",
    message: "Parceiro validado com sucesso.",
    nextAction: "seguir_para_confirmacao_da_inscricao",
    data: {
      partner: {
        id: partner.id,
        nome: partner.nome,
        email: partner.email,
        telefone: partner.telefone,
        playnaquadraAtletaId: partner.playnaquadraAtletaId,
      },
    },
  };
}

async function createTournamentRegistration(args: CreateTournamentRegistrationArgs, context: ToolExecutionContext): Promise<ToolResult> {
  const athleteLookup = await findAthleteByIdentity({
    athleteUserId: args.athleteUserId || context.identity?.userId || null,
    email: args.athleteEmail || context.identity?.email || null,
    phone: args.athletePhone || context.identity?.telefone || null,
    whatsapp: args.athleteWhatsapp || context.whatsapp || null,
  });
  if (athleteLookup.status !== "found") {
    return {
      ok: false,
      tool: "create_tournament_registration",
      status: "athlete_not_found",
      message: "Nao foi possivel localizar o atleta solicitante com os dados informados.",
      nextAction: "validar_cadastro_do_atleta",
      data: {
        athleteUserId: args.athleteUserId || context.identity?.userId || null,
        athleteEmail: normalizeEmail(args.athleteEmail || context.identity?.email || null) || null,
        athletePhone: normalizePhone(args.athletePhone || context.identity?.telefone || context.whatsapp || null) || null,
      },
    };
  }

  const athlete = athleteLookup.matches[0];
  const partnerRows = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      fotoUrl: usuarios.fotoUrl,
    })
    .from(usuarios)
    .where(and(eq(usuarios.id, args.partnerId), eq(usuarios.perfil, "ATLETA")))
    .limit(1);

  const partner = partnerRows[0];
  if (!partner || !partner.playnaquadraAtletaId?.trim()) {
    return {
      ok: false,
      tool: "create_tournament_registration",
      status: "partner_invalid",
      message: "O parceiro informado nao e valido para inscricao.",
      nextAction: "validar_parceiro_novamente",
      data: {
        partnerId: args.partnerId,
      },
    };
  }

  const catRows = await db
    .select({
      id: categorias.id,
      nome: categorias.nome,
      torneioId: categorias.torneioId,
      torneioNome: torneios.nome,
      torneioStatus: torneios.status,
      torneioInscricaoComIa: torneios.inscricaoComIa,
    })
    .from(categorias)
    .innerJoin(torneios, eq(categorias.torneioId, torneios.id))
    .where(and(eq(categorias.id, args.categoryId), eq(torneios.id, args.tournamentId)))
    .limit(1);

  const categoria = catRows[0];
  if (!categoria) {
    return {
      ok: false,
      tool: "create_tournament_registration",
      status: "category_not_found",
      message: "Categoria ou torneio nao encontrados para esta inscricao.",
      nextAction: "revalidar_torneio_e_categoria",
      data: {
        tournamentId: args.tournamentId,
        categoryId: args.categoryId,
      },
    };
  }

  if (categoria.torneioStatus !== "ABERTO") {
    return {
      ok: false,
      tool: "create_tournament_registration",
      status: "tournament_closed",
      message: "As inscricoes nao estao abertas para este torneio.",
      nextAction: "informar_torneio_fechado",
      data: {
        tournamentId: args.tournamentId,
        tournamentStatus: categoria.torneioStatus,
      },
    };
  }

  if (!categoria.torneioInscricaoComIa) {
    return {
      ok: false,
      tool: "create_tournament_registration",
      status: "ai_registration_disabled",
      message:
        context.channel === "webchat"
          ? "O atendimento virtual de inscricao nao esta habilitado para este torneio."
          : "A inscricao via WhatsApp com IA nao esta habilitada para este torneio.",
      nextAction: "informar_canal_alternativo_de_inscricao",
      data: {
        tournamentId: args.tournamentId,
        tournamentName: categoria.torneioNome,
      },
    };
  }

  const partidasExistentes = await db
    .select({ id: partidas.id })
    .from(partidas)
    .where(eq(partidas.categoriaId, args.categoryId))
    .limit(1);
  if (partidasExistentes.length > 0) {
    return {
      ok: false,
      tool: "create_tournament_registration",
      status: "category_closed",
      message: "As inscricoes desta categoria ja foram encerradas porque os jogos ja foram gerados.",
      nextAction: "informar_categoria_encerrada",
      data: {
        categoryId: args.categoryId,
      },
    };
  }

  try {
    const inscricao = await inscricoesService.criar({
      torneioId: args.tournamentId,
      categoriaId: args.categoryId,
      equipeNome: (args.teamName || "").trim() || undefined,
      atletaA: {
        nome: athlete.nome,
        email: athlete.email,
        telefone: athlete.telefone ?? undefined,
        playnaquadraAtletaId: athlete.playnaquadraAtletaId ?? null,
        fotoUrl: athlete.fotoUrl ?? null,
      },
      atletaB: {
        nome: partner.nome,
        email: partner.email,
        telefone: partner.telefone ?? undefined,
        playnaquadraAtletaId: partner.playnaquadraAtletaId ?? null,
        fotoUrl: partner.fotoUrl ?? null,
      },
      status: "PENDENTE",
    });

    const pix = await buildPixForRegistration(inscricao.id, athlete.id);
    return {
      ok: true,
      tool: "create_tournament_registration",
      status: "created",
      message: pix ? "Inscricao criada com sucesso e Pix gerado." : "Inscricao criada com sucesso.",
      nextAction: pix ? "informar_pix_e_status_ao_atleta" : "informar_status_da_inscricao",
      data: {
        registrationId: inscricao.id,
        tournamentId: args.tournamentId,
        tournamentName: categoria.torneioNome,
        categoryId: args.categoryId,
        categoryName: categoria.nome,
        athlete: {
          id: athlete.id,
          nome: athlete.nome,
          email: athlete.email,
          telefone: athlete.telefone,
        },
        partner: {
          id: partner.id,
          nome: partner.nome,
          email: partner.email,
          telefone: partner.telefone,
          playnaquadraAtletaId: partner.playnaquadraAtletaId,
        },
        teamName: (args.teamName || "").trim() || null,
        pix,
      },
    };
  } catch (e: any) {
    return {
      ok: false,
      tool: "create_tournament_registration",
      status: "error",
      message: e?.message || "Falha ao criar inscricao",
      nextAction: "informar_falha_na_inscricao",
      data: {
        tournamentId: args.tournamentId,
        categoryId: args.categoryId,
        partnerId: args.partnerId,
      },
    };
  }
}

export async function executeAiTool(name: string, rawArgs: string, context: ToolExecutionContext): Promise<ToolResult> {
  switch (name as AiToolName) {
    case "check_player_registration":
      return await checkPlayerRegistration(parseArgs<CheckPlayerRegistrationArgs>(rawArgs), context);
    case "get_available_categories":
      return await getAvailableCategories(parseArgs<GetAvailableCategoriesArgs>(rawArgs), context);
    case "validate_partner":
      return await validatePartner(parseArgs<ValidatePartnerArgs>(rawArgs), context);
    case "create_tournament_registration":
      return await createTournamentRegistration(parseArgs<CreateTournamentRegistrationArgs>(rawArgs), context);
    default:
      return {
        ok: false,
        tool: "check_player_registration",
        status: "unknown_tool",
        message: `Tool nao suportada: ${name}`,
        data: { requestedTool: name },
      };
  }
}
