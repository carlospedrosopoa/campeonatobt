import { desc, eq, inArray } from "drizzle-orm";
import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { db } from "@/db";
import { torneios } from "@/db/schema";
import { buildTournamentRegistrationPrompt } from "@/services/ai/prompts";
import { aiTools, executeAiTool, type ToolExecutionContext, type ToolResult } from "@/services/ai/tools";

export type AgentInput = {
  channel?: "whatsapp" | "webchat";
  whatsapp?: string | null;
  messageText: string;
  contactName?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  tournamentSlug?: string | null;
  tournamentName?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  history?: AgentConversationMessage[] | null;
  conversationState?: ConversationStateSnapshot | null;
  identity?: {
    userId?: string | null;
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
  } | null;
};

export type AgentResult = {
  ok: boolean;
  threadId: string;
  replyText: string;
  usedTools: string[];
  toolResults: ToolResult[];
  conversationState: ConversationStateSnapshot;
  messageId?: string | null;
};

export type AgentConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type ConversationIntent = "unknown" | "registration" | "schedule" | "profile";
type ConversationStage =
  | "initial"
  | "awaiting_category"
  | "awaiting_partner"
  | "awaiting_partner_confirmation"
  | "ready_to_register"
  | "registration_created";
type AwaitingField = "none" | "category" | "partner" | "partner_confirmation";

type SelectedTournamentState = {
  id?: string | null;
  nome?: string | null;
  slug?: string | null;
};

type SelectedCategoryState = {
  id?: string | null;
  nome?: string | null;
  slug?: string | null;
  tournamentId?: string | null;
  tournamentName?: string | null;
  tournamentSlug?: string | null;
};

type PartnerState = {
  id?: string | null;
  nome?: string | null;
  status: "unknown" | "mentioned" | "valid" | "ambiguous" | "not_found";
};

export type ConversationStateSnapshot = {
  intent: ConversationIntent;
  stage: ConversationStage;
  awaitingField: AwaitingField;
  selectedTournament: SelectedTournamentState | null;
  selectedCategory: SelectedCategoryState | null;
  partner: PartnerState | null;
  lastTool: string | null;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TOOL_ROUNDS = 4;
const MAX_STORED_MESSAGES = 12;
const threadStore = new Map<string, AgentConversationMessage[]>();
const threadStateStore = new Map<string, ConversationStateSnapshot>();

let openaiClient: OpenAI | null = null;

type TournamentAiAvailabilityResult = {
  shouldBlock: boolean;
  replyText: string;
};

function getOpenAIClient() {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function sanitizeThreadKey(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toThreadId(input: AgentInput) {
  const channel = input.channel || "whatsapp";
  const explicitThread = sanitizeThreadKey(input.threadId);
  if (explicitThread) {
    if (explicitThread.startsWith("webchat:") || explicitThread.startsWith("gzappy:")) {
      return explicitThread;
    }
    return `${channel}:${explicitThread}`;
  }
  if (channel === "webchat") return `webchat:${crypto.randomUUID()}`;
  return `gzappy:${normalizePhone(input.whatsapp) || "unknown"}`;
}

function assistantContentToText(content: string | Array<{ type: string; text?: string }> | null | undefined) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => (item && item.type === "text" && typeof item.text === "string" ? item.text : ""))
    .join("\n")
    .trim();
}

function buildConversationMessages(params: {
  systemPrompt: string;
  history: AgentConversationMessage[];
  inboundText: string;
}): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: params.systemPrompt },
    ...params.history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: "user", content: params.inboundText },
  ];
  return messages;
}

function saveThread(threadId: string, history: AgentConversationMessage[]) {
  threadStore.set(threadId, history.slice(-MAX_STORED_MESSAGES));
}

function normalizeComparableText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseToolArgs<T>(rawArgs: string): T {
  try {
    return JSON.parse(rawArgs) as T;
  } catch {
    return {} as T;
  }
}

function tokenizeComparableText(value?: string | null) {
  return normalizeComparableText(value).split(" ").filter(Boolean);
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }

    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function detectIntentFromText(messageText: string, currentIntent: ConversationIntent): ConversationIntent {
  const normalized = normalizeComparableText(messageText);
  if (!normalized) return currentIntent;

  const hasScheduleIntent = /(programacao|horario|horarios|dia|dias|data|datas)/.test(normalized);
  const hasProfileIntent = /(cadastro|perfil|foto|conta|email|telefone)/.test(normalized);
  const hasRegistrationIntent = /(inscri|inscricao|jogar|categoria|parceiro|dupla)/.test(normalized);

  if (hasRegistrationIntent) return "registration";
  if (hasProfileIntent && !hasScheduleIntent) return "profile";
  if (hasScheduleIntent) return "schedule";
  return currentIntent;
}

function hasExplicitPartnerSignal(messageText: string) {
  const normalized = normalizeComparableText(messageText);
  if (!normalized) return false;

  return (
    normalized.includes("parceiro") ||
    normalized.includes("dupla com") ||
    normalized.includes("jogar com") ||
    normalized.includes("jogo com") ||
    normalized.includes("quero jogar com") ||
    normalized.includes("gostaria de jogar com") ||
    normalized.includes("tem algum")
  );
}

function createInitialThreadState(input: AgentInput): ConversationStateSnapshot {
  return {
    intent: "unknown",
    stage: "initial",
    awaitingField: "none",
    selectedTournament:
      input.tournamentName || input.tournamentSlug
        ? {
            nome: input.tournamentName || null,
            slug: input.tournamentSlug || null,
          }
        : null,
    selectedCategory: null,
    partner: null,
    lastTool: null,
  };
}

function normalizeConversationHistory(history?: AgentConversationMessage[] | null): AgentConversationMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .map<AgentConversationMessage>((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").trim(),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_STORED_MESSAGES);
}

function normalizeConversationStateSnapshot(
  snapshot: ConversationStateSnapshot | null | undefined
): ConversationStateSnapshot | null {
  if (!snapshot) return null;

  const validIntent = new Set<ConversationIntent>(["unknown", "registration", "schedule", "profile"]);
  const validStage = new Set<ConversationStage>([
    "initial",
    "awaiting_category",
    "awaiting_partner",
    "awaiting_partner_confirmation",
    "ready_to_register",
    "registration_created",
  ]);
  const validAwaitingFields = new Set<AwaitingField>(["none", "category", "partner", "partner_confirmation"]);
  const validPartnerStatuses = new Set<PartnerState["status"]>(["unknown", "mentioned", "valid", "ambiguous", "not_found"]);

  return {
    intent: validIntent.has(snapshot.intent) ? snapshot.intent : "unknown",
    stage: validStage.has(snapshot.stage) ? snapshot.stage : "initial",
    awaitingField: validAwaitingFields.has(snapshot.awaitingField) ? snapshot.awaitingField : "none",
    selectedTournament: snapshot.selectedTournament
      ? {
          id: String(snapshot.selectedTournament.id || "").trim() || null,
          nome: String(snapshot.selectedTournament.nome || "").trim() || null,
          slug: String(snapshot.selectedTournament.slug || "").trim() || null,
        }
      : null,
    selectedCategory: snapshot.selectedCategory
      ? {
          id: String(snapshot.selectedCategory.id || "").trim() || null,
          nome: String(snapshot.selectedCategory.nome || "").trim() || null,
          slug: String(snapshot.selectedCategory.slug || "").trim() || null,
          tournamentId: String(snapshot.selectedCategory.tournamentId || "").trim() || null,
          tournamentName: String(snapshot.selectedCategory.tournamentName || "").trim() || null,
          tournamentSlug: String(snapshot.selectedCategory.tournamentSlug || "").trim() || null,
        }
      : null,
    partner: snapshot.partner
      ? {
          id: String(snapshot.partner.id || "").trim() || null,
          nome: String(snapshot.partner.nome || "").trim() || null,
          status: validPartnerStatuses.has(snapshot.partner.status) ? snapshot.partner.status : "unknown",
        }
      : null,
    lastTool: String(snapshot.lastTool || "").trim() || null,
  };
}

function mergeThreadStateWithInput(state: ConversationStateSnapshot, input: AgentInput) {
  if (!state.selectedTournament && (input.tournamentName || input.tournamentSlug)) {
    state.selectedTournament = {
      nome: input.tournamentName || null,
      slug: input.tournamentSlug || null,
    };
  }

  state.intent = detectIntentFromText(input.messageText, state.intent);
  return syncThreadState(state);
}

function syncThreadState(state: ConversationStateSnapshot) {
  if (state.stage === "registration_created") {
    state.awaitingField = "none";
    return state;
  }

  if (state.selectedCategory?.id && state.partner?.status === "valid") {
    state.stage = "ready_to_register";
    state.awaitingField = "none";
    return state;
  }

  if (state.partner?.status === "ambiguous" || state.awaitingField === "partner_confirmation") {
    state.stage = "awaiting_partner_confirmation";
    state.awaitingField = "partner_confirmation";
    return state;
  }

  if (state.selectedCategory?.id) {
    state.stage = "awaiting_partner";
    state.awaitingField = "partner";
    return state;
  }

  if (state.partner?.status === "valid") {
    state.stage = "awaiting_category";
    state.awaitingField = "category";
    return state;
  }

  if (state.intent === "registration") {
    state.stage = "awaiting_category";
    state.awaitingField = "category";
    return state;
  }

  state.stage = "initial";
  state.awaitingField = "none";
  return state;
}

function formatIntentLabel(intent: ConversationIntent) {
  switch (intent) {
    case "registration":
      return "inscricao";
    case "schedule":
      return "programacao";
    case "profile":
      return "cadastro";
    default:
      return "indefinida";
  }
}

function formatStageLabel(stage: ConversationStage) {
  switch (stage) {
    case "awaiting_category":
      return "aguardando categoria";
    case "awaiting_partner":
      return "aguardando parceiro";
    case "awaiting_partner_confirmation":
      return "aguardando confirmacao do parceiro";
    case "ready_to_register":
      return "pronto para concluir a inscricao";
    case "registration_created":
      return "inscricao ja criada";
    default:
      return "inicio do atendimento";
  }
}

function buildConversationStateSummary(state: ConversationStateSnapshot) {
  const lines = [
    `- Intencao atual: ${formatIntentLabel(state.intent)}`,
    `- Etapa atual: ${formatStageLabel(state.stage)}`,
    `- Torneio ja identificado: ${state.selectedTournament?.nome || state.selectedTournament?.slug || "ainda nao"}`,
    `- Categoria ja escolhida pelo atleta: ${state.selectedCategory?.nome || "ainda nao"}`,
    `- Parceiro atual: ${
      state.partner?.nome
        ? `${state.partner.nome} (${state.partner.status === "valid" ? "validado" : state.partner.status})`
        : "ainda nao informado"
    }`,
  ];

  if (state.selectedCategory?.nome) {
    lines.push("- Nao pergunte novamente qual categoria o atleta quer, a menos que ele mude a escolha.");
  }

  if (state.partner?.status === "valid") {
    lines.push("- Nao pergunte novamente quem e o parceiro, porque ele ja foi validado.");
  }

  if (state.awaitingField === "partner") {
    lines.push("- Falta apenas identificar ou confirmar o parceiro antes de concluir a inscricao.");
  }

  if (state.stage === "ready_to_register") {
    lines.push("- Categoria e parceiro ja estao resolvidos; avance sem voltar etapas.");
  }

  return lines.join("\n");
}

function resolveSelectedCategory(
  categories: Array<Record<string, unknown>>,
  messageText: string
): SelectedCategoryState | null {
  const normalizedMessage = normalizeComparableText(messageText);
  const messageTokens = tokenizeComparableText(messageText);
  if (!normalizedMessage || messageTokens.length === 0) return null;

  const scoredMatches = categories
    .map((category) => {
      const categoryName = String(category.nome || "").trim();
      const normalizedCategory = normalizeComparableText(categoryName);
      const categoryTokens = tokenizeComparableText(categoryName);
      if (!normalizedCategory || categoryTokens.length === 0) return null;

      let bestScore = 0;
      if (normalizedMessage === normalizedCategory) {
        bestScore = 1;
      } else if (normalizedMessage.includes(normalizedCategory)) {
        bestScore = 0.99;
      } else {
        const minWindowSize = Math.max(1, categoryTokens.length);
        const maxWindowSize = Math.min(messageTokens.length, categoryTokens.length + 2);

        for (let windowSize = minWindowSize; windowSize <= maxWindowSize; windowSize += 1) {
          for (let start = 0; start <= messageTokens.length - windowSize; start += 1) {
            const windowText = messageTokens.slice(start, start + windowSize).join(" ");
            const distance = levenshteinDistance(windowText, normalizedCategory);
            const score = 1 - distance / Math.max(windowText.length, normalizedCategory.length);
            if (score > bestScore) bestScore = score;
          }
        }
      }

      return {
        score: bestScore,
        category,
      };
    })
    .filter((item): item is { score: number; category: Record<string, unknown> } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  const best = scoredMatches[0];
  const second = scoredMatches[1];
  if (!best || best.score < 0.72) return null;
  if (second && second.score >= 0.68 && best.score - second.score < 0.08) return null;

  return {
    id: String(best.category.id || "").trim() || null,
    nome: String(best.category.nome || "").trim() || null,
    slug: String(best.category.slug || "").trim() || null,
  };
}

function updateTournamentStateFromToolResult(state: ConversationStateSnapshot, result: ToolResult) {
  const tournamentData = (result.data?.tournament ?? null) as Record<string, unknown> | null;
  if (!tournamentData) return;

  state.selectedTournament = {
    id: String(tournamentData.id || "").trim() || state.selectedTournament?.id || null,
    nome: String(tournamentData.nome || "").trim() || state.selectedTournament?.nome || null,
    slug: String(tournamentData.slug || "").trim() || state.selectedTournament?.slug || null,
  };
}

function updateThreadStateFromToolResult(
  state: ConversationStateSnapshot,
  toolName: string,
  result: ToolResult,
  input: AgentInput
) {
  state.lastTool = toolName;

  switch (toolName) {
    case "get_available_categories": {
      updateTournamentStateFromToolResult(state, result);
      const categories = Array.isArray(result.data?.categories) ? (result.data.categories as Array<Record<string, unknown>>) : [];
      const selectedCategory = resolveSelectedCategory(categories, input.messageText);

      if (selectedCategory) {
        state.selectedCategory = {
          ...state.selectedCategory,
          ...selectedCategory,
          tournamentId: String((result.data?.tournament as Record<string, unknown> | undefined)?.id || "").trim() || null,
          tournamentName: String((result.data?.tournament as Record<string, unknown> | undefined)?.nome || "").trim() || null,
          tournamentSlug: String((result.data?.tournament as Record<string, unknown> | undefined)?.slug || "").trim() || null,
        };
      } else if (!state.selectedCategory?.id && state.intent === "registration") {
        state.awaitingField = "category";
      }
      break;
    }
    case "get_tournament_schedule":
      updateTournamentStateFromToolResult(state, result);
      break;
    case "validate_partner": {
      if (result.status === "valid") {
        const partnerData = (result.data?.partner ?? null) as Record<string, unknown> | null;
        state.partner = {
          id: String(partnerData?.id || "").trim() || null,
          nome: String(partnerData?.nome || "").trim() || null,
          status: "valid",
        };
      } else if (result.status === "ambiguous") {
        state.partner = {
          id: state.partner?.id || null,
          nome: state.partner?.nome || null,
          status: "ambiguous",
        };
        state.awaitingField = "partner_confirmation";
      } else if (result.status === "not_found") {
        state.partner = {
          id: null,
          nome: String(result.data?.partnerName || "").trim() || null,
          status: "not_found",
        };
        state.awaitingField = "partner";
      } else if (result.status === "found_without_profile" || result.status === "found_on_play_only") {
        const partnerData = (result.data?.partner ?? null) as Record<string, unknown> | null;
        state.partner = {
          id: String(partnerData?.id || "").trim() || null,
          nome: String(partnerData?.nome || "").trim() || null,
          status: "mentioned",
        };
        state.awaitingField = "partner";
      } else if (result.status === "invalid_input" || result.status === "partner_not_informed" || result.status === "blocked_by_flow") {
        state.awaitingField = state.selectedCategory?.id ? "partner" : "category";
      }
      break;
    }
    case "create_tournament_registration":
      if (result.status === "created") {
        state.stage = "registration_created";
        state.awaitingField = "none";
      }
      break;
    default:
      break;
  }

  syncThreadState(state);
}

function buildBlockedPartnerValidationResult(state: ConversationStateSnapshot): ToolResult {
  return {
    ok: true,
    tool: "validate_partner",
    status: "blocked_by_flow",
    message:
      "Ainda nao ha parceiro explicitamente informado nesta mensagem. Nao use o nome do atleta ou do contato como parceiro.",
    nextAction: state.selectedCategory?.id ? "solicitar_nome_ou_whatsapp_do_parceiro" : "seguir_definindo_categoria",
    data: {
      selectedCategory: state.selectedCategory?.nome || null,
      currentStage: state.stage,
    },
  };
}

function buildBlockedRegistrationCreationResult(state: ConversationStateSnapshot): ToolResult {
  return {
    ok: true,
    tool: "create_tournament_registration",
    status: "blocked_by_flow",
    message: "A inscricao ainda nao pode ser criada porque faltam etapas obrigatorias do fluxo.",
    nextAction: !state.selectedCategory?.id
      ? "solicitar_categoria_ao_atleta"
      : state.partner?.status !== "valid"
        ? "solicitar_confirmacao_do_parceiro"
        : "seguir_fluxo_normal",
    data: {
      selectedCategory: state.selectedCategory?.nome || null,
      partnerStatus: state.partner?.status || "unknown",
      currentStage: state.stage,
    },
  };
}

function maybeGuardToolCall(params: {
  toolName: string;
  rawArgs: string;
  input: AgentInput;
  state: ConversationStateSnapshot;
}): ToolResult | null {
  if (params.toolName === "validate_partner") {
    const args = parseToolArgs<{ partnerName?: string; partnerWhatsapp?: string }>(params.rawArgs);
    const partnerName = String(args.partnerName || "").trim();
    const partnerWhatsapp = normalizePhone(args.partnerWhatsapp);
    const canValidatePartner =
      params.state.awaitingField === "partner" ||
      params.state.awaitingField === "partner_confirmation" ||
      hasExplicitPartnerSignal(params.input.messageText);

    if (!canValidatePartner || (!partnerName && !partnerWhatsapp)) {
      return buildBlockedPartnerValidationResult(params.state);
    }
  }

  if (params.toolName === "create_tournament_registration") {
    const args = parseToolArgs<{ categoryId?: string; partnerId?: string }>(params.rawArgs);
    const hasCategoryReady = Boolean(params.state.selectedCategory?.id) && (
      !args.categoryId || params.state.selectedCategory?.id === args.categoryId
    );
    const hasPartnerReady = params.state.partner?.status === "valid" && (
      !args.partnerId || params.state.partner?.id === args.partnerId
    );

    if (!hasCategoryReady || !hasPartnerReady) {
      return buildBlockedRegistrationCreationResult(params.state);
    }
  }

  return null;
}

async function checkTournamentAiAvailability(params: {
  messageText: string;
  tournamentSlug?: string | null;
  tournamentName?: string | null;
  channel: "whatsapp" | "webchat";
}): Promise<TournamentAiAvailabilityResult | null> {
  const tournamentSlug = String(params.tournamentSlug || "").trim();
  if (tournamentSlug) {
    const exactTournament = await db
      .select({
        id: torneios.id,
        nome: torneios.nome,
        slug: torneios.slug,
        inscricaoComIa: torneios.inscricaoComIa,
      })
      .from(torneios)
      .where(eq(torneios.slug, tournamentSlug))
      .limit(1);

    const tournament = exactTournament[0];
    if (tournament && !tournament.inscricaoComIa) {
      return {
        shouldBlock: true,
        replyText:
          params.channel === "webchat"
            ? `O atendimento virtual de inscricao nao esta habilitado para o torneio ${tournament.nome} no momento.`
            : `A inscricao via WhatsApp com IA nao esta habilitada para o torneio ${tournament.nome} no momento.`,
      };
    }
    if (tournament && tournament.inscricaoComIa) return null;
  }

  const openTournaments = await db
    .select({
      id: torneios.id,
      nome: torneios.nome,
      slug: torneios.slug,
      inscricaoComIa: torneios.inscricaoComIa,
    })
    .from(torneios)
    .where(inArray(torneios.status, ["ABERTO", "EM_ANDAMENTO"]))
    .orderBy(desc(torneios.criadoEm))
    .limit(100);

  if (openTournaments.length === 0) return null;

  if (!openTournaments.some((tournament) => tournament.inscricaoComIa)) {
    return {
      shouldBlock: true,
      replyText:
        params.channel === "webchat"
          ? "No momento nao ha torneios com atendimento virtual de inscricao habilitado. Fale com a organizacao ou use os canais normais de inscricao."
          : "No momento nao ha torneios com inscricao via WhatsApp com IA habilitada. Fale com a organizacao ou use os canais normais de inscricao.",
    };
  }

  const normalizedMessage = normalizeComparableText(`${params.tournamentName || ""} ${params.messageText}`);
  if (!normalizedMessage) return null;

  const match = openTournaments
    .map((tournament) => {
      const candidates = [normalizeComparableText(tournament.nome), normalizeComparableText(tournament.slug)].filter(Boolean);
      const bestScore = candidates.reduce((max, candidate) => {
        if (!candidate || candidate.length < 4) return max;
        return normalizedMessage.includes(candidate) ? Math.max(max, candidate.length) : max;
      }, 0);
      return { tournament, bestScore };
    })
    .filter((item) => item.bestScore > 0)
    .sort((a, b) => b.bestScore - a.bestScore)[0];

  if (match && !match.tournament.inscricaoComIa) {
    return {
      shouldBlock: true,
      replyText:
        params.channel === "webchat"
          ? `O atendimento virtual de inscricao nao esta habilitado para o torneio ${match.tournament.nome} no momento.`
          : `A inscricao via WhatsApp com IA nao esta habilitada para o torneio ${match.tournament.nome} no momento.`,
    };
  }

  return null;
}

export async function runTournamentRegistrationAgent(input: AgentInput): Promise<AgentResult> {
  const channel = input.channel || "whatsapp";
  const whatsapp = normalizePhone(input.whatsapp);
  const threadId = toThreadId(input);
  const clientHistory = normalizeConversationHistory(input.history);
  const history = threadStore.get(threadId) ?? clientHistory;
  const baseThreadState =
    threadStateStore.get(threadId) ??
    normalizeConversationStateSnapshot(input.conversationState) ??
    createInitialThreadState(input);
  const threadState = mergeThreadStateWithInput(baseThreadState, input);
  const availabilityCheck = await checkTournamentAiAvailability({
    messageText: input.messageText,
    tournamentSlug: input.tournamentSlug,
    tournamentName: input.tournamentName,
    channel,
  });
  if (availabilityCheck?.shouldBlock) {
    saveThread(threadId, [
      ...history,
      { role: "user", content: input.messageText },
      { role: "assistant", content: availabilityCheck.replyText },
    ]);
    threadStateStore.set(threadId, threadState);
    return {
      ok: false,
      threadId,
      replyText: availabilityCheck.replyText,
      usedTools: [],
      toolResults: [],
      conversationState: threadState,
      messageId: input.messageId ?? null,
    };
  }

  const systemPrompt = buildTournamentRegistrationPrompt({
    channel,
    whatsapp,
    contactName: input.contactName,
    tournamentSlug: input.tournamentSlug,
    tournamentName: input.tournamentName,
    categorySlug: input.categorySlug,
    categoryName: input.categoryName,
    conversationStateSummary: buildConversationStateSummary(threadState),
    identity: input.identity,
  });

  const client = getOpenAIClient();
  if (!client) {
    const replyText =
      "Nosso atendimento inteligente ainda nao esta configurado. Por favor, tente novamente mais tarde ou fale com a organizacao.";
    saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: replyText }]);
    threadStateStore.set(threadId, threadState);
    return {
      ok: false,
      threadId,
      replyText,
      usedTools: [],
      toolResults: [],
      conversationState: threadState,
      messageId: input.messageId ?? null,
    };
  }

  const messages = buildConversationMessages({
    systemPrompt,
    history,
    inboundText: input.messageText,
  });

  const toolResults: ToolResult[] = [];
  const usedTools: string[] = [];
  const toolContext: ToolExecutionContext = {
    channel,
    whatsapp,
    contactName: input.contactName,
    threadId,
    inboundText: input.messageText,
    tournamentSlug: input.tournamentSlug,
    tournamentName: input.tournamentName,
    categorySlug: input.categorySlug,
    categoryName: input.categoryName,
    identity: input.identity ?? null,
  };

  let finalReply = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      messages,
      tools: aiTools,
      tool_choice: "auto",
    });

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) break;

    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? "",
      tool_calls: assistantMessage.tool_calls,
    } as ChatCompletionAssistantMessageParam);

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const call of assistantMessage.tool_calls) {
        const guardedResult =
          maybeGuardToolCall({
            toolName: call.function.name,
            rawArgs: call.function.arguments,
            input,
            state: threadState,
          }) ?? null;
        const result = guardedResult ?? (await executeAiTool(call.function.name, call.function.arguments, toolContext));
        toolResults.push(result);
        usedTools.push(call.function.name);
        updateThreadStateFromToolResult(threadState, call.function.name, result, input);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        } satisfies ChatCompletionToolMessageParam);
      }
      continue;
    }

    finalReply = assistantContentToText(assistantMessage.content);
    if (finalReply) break;
  }

  if (!finalReply) {
    finalReply =
      "Recebi sua mensagem e ja estou te ajudando com a inscricao. Pode me dizer o nome do torneio ou a categoria que voce deseja jogar?";
  }

  saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: finalReply }]);
  threadStateStore.set(threadId, threadState);

  return {
    ok: true,
    threadId,
    replyText: finalReply,
    usedTools,
    toolResults,
    conversationState: threadState,
    messageId: input.messageId ?? null,
  };
}
