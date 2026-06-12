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
import { aiTools, executeAiTool, getAthleteRegistrationsSummaryForTournament, type ToolExecutionContext, type ToolResult } from "@/services/ai/tools";

export type AgentInput = {
  channel?: "whatsapp" | "webchat";
  whatsapp?: string | null;
  messageText: string;
  contactName?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  tournamentId?: string | null;
  tournamentSlug?: string | null;
  tournamentName?: string | null;
  categoryId?: string | null;
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

type PartnerCandidateState = {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  whatsappSuffix?: string | null;
};

export type ConversationStateSnapshot = {
  intent: ConversationIntent;
  stage: ConversationStage;
  awaitingField: AwaitingField;
  hasShownExistingRegistrations: boolean;
  selectedTournament: SelectedTournamentState | null;
  selectedCategory: SelectedCategoryState | null;
  partner: PartnerState | null;
  partnerCandidates: PartnerCandidateState[];
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeComparablePhrase(haystack: string, needle: string) {
  if (!haystack || !needle) return false;
  return new RegExp(`(^| )${escapeRegExp(needle)}($| )`).test(haystack);
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

function isAffirmativeConfirmation(messageText: string) {
  const normalized = normalizeComparableText(messageText);
  if (!normalized) return false;

  if (new Set([
    "sim",
    "s",
    "ok",
    "okay",
    "certo",
    "ta certo",
    "tá certo",
    "esta certo",
    "está certo",
    "isso",
    "isso mesmo",
    "pode seguir",
    "pode prosseguir",
    "vamos seguir",
    "pode continuar",
    "confirmo",
    "confirmado",
  ]).has(normalized)) {
    return true;
  }

  return (
    /^(esse|este) mesmo$/.test(normalized) ||
    /^(perfeito|exato|correto)$/.test(normalized) ||
    /^(perfeito|exato|correto) (esse|este) mesmo$/.test(normalized)
  );
}

function inferPartnerValidationArgsFromMessage(messageText: string) {
  const rawText = String(messageText || "").trim();
  if (!rawText) {
    return { partnerName: "", partnerWhatsapp: "" };
  }

  const partnerWhatsapp = normalizePhone(rawText);
  let candidateName = rawText.replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "");
  const extractionPatterns = [
    /(?:quero jogar com|gostaria de jogar com|vou jogar com|irei jogar com|jogar com|jogo com|dupla com)\s+(.+)$/i,
    /(?:parceiro(?: sera| será| e| é| eh)?|com o|com a)\s+(.+)$/i,
    /^(?:e o|e a|o|a)\s+(.+)$/i,
    /^(?:nao|não)\s+desculpa[, ]*(.+)$/i,
    /^(?:desculpa[, ]*)(.+)$/i,
  ];

  for (const pattern of extractionPatterns) {
    const match = rawText.match(pattern);
    if (match?.[1]) {
      candidateName = match[1].trim();
      break;
    }
  }

  candidateName = candidateName
    .replace(/^esta categoria\s+/i, "")
    .replace(/^[\[\](){}"'`]+|[\[\](){}"'`]+$/g, "")
    .replace(/[?!.;,]+$/g, "")
    .trim();

  const normalizedCandidateName = normalizeComparableText(candidateName);
  const invalidNameTokens = new Set([
    "",
    "sim",
    "ok",
    "okay",
    "certo",
    "isso",
    "esse mesmo",
    "este mesmo",
    "nao",
    "não",
    "ele",
    "ela",
  ]);

  if (invalidNameTokens.has(normalizedCandidateName) || /^\d+$/.test(candidateName.replace(/\s+/g, ""))) {
    candidateName = "";
  }

  return {
    partnerName: candidateName,
    partnerWhatsapp: partnerWhatsapp.length >= 8 ? partnerWhatsapp : "",
  };
}

function messageHasPartnerIdentitySignal(
  messageText: string,
  inferredArgs: { partnerName?: string; partnerWhatsapp?: string }
) {
  const rawMessage = String(messageText || "").trim();
  const rawPartnerName = String(inferredArgs.partnerName || "").trim();
  const normalizedMessage = normalizeComparableText(rawMessage);
  const normalizedPartnerName = normalizeComparableText(rawPartnerName);

  if (String(inferredArgs.partnerWhatsapp || "").trim()) {
    return true;
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(rawMessage)) {
    return true;
  }

  if (hasExplicitPartnerSignal(rawMessage)) {
    return true;
  }

  return Boolean(
    normalizedPartnerName &&
      normalizedPartnerName !== normalizedMessage &&
      rawPartnerName &&
      rawPartnerName.length < rawMessage.length
  );
}

function shouldForcePartnerValidation(params: {
  state: ConversationStateSnapshot;
  messageText: string;
  inferredArgs: { partnerName?: string; partnerWhatsapp?: string };
}) {
  if (params.state.awaitingField === "partner" || params.state.awaitingField === "partner_confirmation") {
    return true;
  }

  if (!params.state.selectedCategory?.id || params.state.partner?.status === "valid") {
    return false;
  }

  const normalized = normalizeComparableText(params.messageText);
  if (!normalized) return false;

  if (/(categoria|torneio|programacao|horario|horarios|dia|dias|data|datas|cadastro|perfil)/.test(normalized)) {
    return false;
  }

  return Boolean(params.inferredArgs.partnerName || params.inferredArgs.partnerWhatsapp);
}

function normalizePartnerCandidates(value: unknown): PartnerCandidateState[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: String(item.id || "").trim() || null,
      nome: String(item.nome || "").trim() || null,
      email: String(item.email || "").trim() || null,
      telefone: String(item.telefone || "").trim() || null,
      whatsappSuffix: String(item.whatsappSuffix || "").trim() || null,
    }))
    .filter((item) => Boolean(item.nome || item.email || item.telefone || item.id));
}

function resolvePartnerCandidateSelection(messageText: string, candidates: PartnerCandidateState[]) {
  const rawText = String(messageText || "").trim();
  if (!rawText || candidates.length === 0) return null;

  const numericMatch = rawText.match(/^\D*(\d{1,2})\D*$/);
  if (numericMatch) {
    const optionIndex = Number(numericMatch[1]) - 1;
    if (optionIndex >= 0 && optionIndex < candidates.length) {
      const selected = candidates[optionIndex];
      return {
        partnerId: selected.id || "",
        partnerName: selected.email || selected.nome || "",
        partnerWhatsapp: normalizePhone(selected.telefone),
      };
    }
  }

  const normalizedEmail = String(rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").trim().toLowerCase();
  if (normalizedEmail) {
    const selected = candidates.find((candidate) => String(candidate.email || "").trim().toLowerCase() === normalizedEmail);
    if (selected) {
      return {
        partnerId: selected.id || "",
        partnerName: selected.email || selected.nome || "",
        partnerWhatsapp: normalizePhone(selected.telefone),
      };
    }
  }

  const typedDigits = normalizePhone(rawText);
  if (typedDigits.length >= 4) {
    const selected = candidates.find((candidate) => {
      const candidatePhone = normalizePhone(candidate.telefone);
      const suffix = String(candidate.whatsappSuffix || "").trim();
      return (
        (candidatePhone && candidatePhone.endsWith(typedDigits)) ||
        (suffix && suffix === typedDigits.slice(-suffix.length))
      );
    });
    if (selected) {
      return {
        partnerId: selected.id || "",
        partnerName: selected.email || selected.nome || "",
        partnerWhatsapp: normalizePhone(selected.telefone),
      };
    }
  }

  const normalizedText = normalizeComparableText(rawText);
  if (normalizedText) {
    const selected = candidates.find((candidate) => normalizeComparableText(candidate.nome) === normalizedText);
    if (selected) {
      return {
        partnerId: selected.id || "",
        partnerName: selected.email || selected.nome || "",
        partnerWhatsapp: normalizePhone(selected.telefone),
      };
    }
  }

  return null;
}

function createInitialThreadState(input: AgentInput): ConversationStateSnapshot {
  return {
    intent: "unknown",
    stage: "initial",
    awaitingField: "none",
    hasShownExistingRegistrations: false,
    selectedTournament:
      input.tournamentId || input.tournamentName || input.tournamentSlug
        ? {
            id: input.tournamentId || null,
            nome: input.tournamentName || null,
            slug: input.tournamentSlug || null,
          }
        : null,
    selectedCategory:
      input.categoryId || input.categoryName || input.categorySlug
        ? {
            id: input.categoryId || null,
            nome: input.categoryName || null,
            slug: input.categorySlug || null,
            tournamentId: input.tournamentId || null,
            tournamentName: input.tournamentName || null,
            tournamentSlug: input.tournamentSlug || null,
          }
        : null,
    partner: null,
    partnerCandidates: [],
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
    hasShownExistingRegistrations: Boolean(snapshot.hasShownExistingRegistrations),
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
    partnerCandidates: normalizePartnerCandidates(snapshot.partnerCandidates),
    lastTool: String(snapshot.lastTool || "").trim() || null,
  };
}

function mergeThreadStateWithInput(state: ConversationStateSnapshot, input: AgentInput) {
  if (!state.selectedTournament && (input.tournamentId || input.tournamentName || input.tournamentSlug)) {
    state.selectedTournament = {
      id: input.tournamentId || null,
      nome: input.tournamentName || null,
      slug: input.tournamentSlug || null,
    };
  }

  if (!state.selectedCategory && (input.categoryId || input.categoryName || input.categorySlug)) {
    state.selectedCategory = {
      id: input.categoryId || null,
      nome: input.categoryName || null,
      slug: input.categorySlug || null,
      tournamentId: input.tournamentId || state.selectedTournament?.id || null,
      tournamentName: input.tournamentName || state.selectedTournament?.nome || null,
      tournamentSlug: input.tournamentSlug || state.selectedTournament?.slug || null,
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

function extractRelevantCategoryTokens(messageText: string) {
  const ignoredTokens = new Set([
    "quero",
    "queria",
    "gostaria",
    "vou",
    "me",
    "inscrever",
    "inscricao",
    "jogar",
    "na",
    "no",
    "de",
    "do",
    "da",
    "categoria",
    "torneio",
    "a",
    "o",
    "uma",
    "um",
  ]);

  return tokenizeComparableText(messageText).filter((token) => !ignoredTokens.has(token));
}

function resolveSelectedCategory(
  categories: Array<Record<string, unknown>>,
  messageText: string
): SelectedCategoryState | null {
  const normalizedMessage = normalizeComparableText(messageText);
  const messageTokens = tokenizeComparableText(messageText);
  const relevantTokens = extractRelevantCategoryTokens(messageText);
  if (!normalizedMessage || messageTokens.length === 0) return null;

  const exactPhraseMatches = categories.filter((category) => {
    const normalizedCategory = normalizeComparableText(String(category.nome || "").trim());
    return Boolean(normalizedCategory) && containsWholeComparablePhrase(normalizedMessage, normalizedCategory);
  });

  if (exactPhraseMatches.length === 1) {
    const category = exactPhraseMatches[0];
    return {
      id: String(category.id || "").trim() || null,
      nome: String(category.nome || "").trim() || null,
      slug: String(category.slug || "").trim() || null,
    };
  }

  if (relevantTokens.length > 0) {
    const tokenMatches = categories.filter((category) => {
      const categoryName = String(category.nome || "").trim();
      const categoryTokens = tokenizeComparableText(categoryName);
      if (!categoryName || categoryTokens.length === 0) return false;
      return relevantTokens.every((token) => categoryTokens.includes(token));
    });

    const exactTokenMatches = tokenMatches.filter((category) => {
      const categoryTokens = tokenizeComparableText(String(category.nome || "").trim());
      return categoryTokens.length === relevantTokens.length && categoryTokens.every((token, index) => token === relevantTokens[index]);
    });

    if (exactTokenMatches.length === 1) {
      const category = exactTokenMatches[0];
      return {
        id: String(category.id || "").trim() || null,
        nome: String(category.nome || "").trim() || null,
        slug: String(category.slug || "").trim() || null,
      };
    }

    if (tokenMatches.length === 1) {
      const category = tokenMatches[0];
      return {
        id: String(category.id || "").trim() || null,
        nome: String(category.nome || "").trim() || null,
        slug: String(category.slug || "").trim() || null,
      };
    }

    if (tokenMatches.length > 1) {
      return null;
    }
  }

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

function buildCategoryConfirmationLines(
  result: ToolResult,
  selectedCategory: SelectedCategoryState | null
): string[] | null {
  if (result.tool !== "get_available_categories" || result.status !== "ok") return null;

  const categories = Array.isArray(result.data?.categories)
    ? result.data.categories.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  const feeSummary = result.data?.feeSummary && typeof result.data.feeSummary === "object"
    ? (result.data.feeSummary as Record<string, unknown>)
    : null;

  if (selectedCategory?.id) {
    const categoryData = categories.find((item) => String(item.id || "").trim() === selectedCategory.id) || null;
    const categoryName = selectedCategory.nome || String(categoryData?.nome || "").trim() || "Categoria";
    const categoryFee = String(categoryData?.valorInscricao || "").trim();
    const lines = [`A categoria "${categoryName}" está disponível.`];

    if (categoryFee) {
      lines.push(`Valor da inscrição: R$ ${categoryFee} por atleta.`);
    } else if (String(feeSummary?.amountPerAthlete || "").trim()) {
      lines.push(`Valor da inscrição: R$ ${String(feeSummary?.amountPerAthlete).trim()} por atleta.`);
    }

    return lines;
  }

  return null;
}

function buildCategoryReplyFromToolResult(
  result: ToolResult,
  selectedCategory: SelectedCategoryState | null
): string | null {
  const confirmationLines = buildCategoryConfirmationLines(result, selectedCategory);
  if (confirmationLines) {
    return [...confirmationLines, "Agora, por favor, me informe o nome ou o WhatsApp do seu parceiro."].join("\n");
  }

  if (result.tool !== "get_available_categories" || result.status !== "ok") return null;

  const categories = Array.isArray(result.data?.categories)
    ? result.data.categories.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  const feeSummary = result.data?.feeSummary && typeof result.data.feeSummary === "object"
    ? (result.data.feeSummary as Record<string, unknown>)
    : null;

  if (categories.length === 0) {
    return "Não encontrei categorias abertas para inscrição neste torneio agora.";
  }

  const lines: string[] = [];
  if (String(feeSummary?.amountPerAthlete || "").trim() && feeSummary?.sameFeeForAllCategories) {
    lines.push(`Valor da inscrição: R$ ${String(feeSummary.amountPerAthlete).trim()} por atleta.`);
  }
  lines.push("Categorias disponíveis:");
  lines.push(...categories.map((item) => `• ${String(item.nome || "").trim()}`));
  lines.push("Me diga exatamente qual categoria você quer jogar.");
  return lines.join("\n");
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
        state.partnerCandidates = [];
      } else if (result.status === "ambiguous") {
        state.partner = {
          id: state.partner?.id || null,
          nome: state.partner?.nome || null,
          status: "ambiguous",
        };
        state.partnerCandidates = normalizePartnerCandidates(result.data?.candidates);
        state.awaitingField = "partner_confirmation";
      } else if (result.status === "not_found") {
        state.partner = {
          id: null,
          nome: String(result.data?.partnerName || "").trim() || null,
          status: "not_found",
        };
        state.partnerCandidates = [];
        state.awaitingField = "partner";
      } else if (result.status === "found_without_profile" || result.status === "found_on_play_only") {
        const partnerData = (result.data?.partner ?? null) as Record<string, unknown> | null;
        state.partner = {
          id: String(partnerData?.id || "").trim() || null,
          nome: String(partnerData?.nome || "").trim() || null,
          status: "mentioned",
        };
        state.partnerCandidates = [];
        state.awaitingField = "partner_confirmation";
      } else if (result.status === "invalid_input" || result.status === "partner_not_informed" || result.status === "blocked_by_flow") {
        state.partnerCandidates = [];
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

function formatPartnerCandidatesFromToolResult(result: ToolResult) {
  const candidates = Array.isArray(result.data?.candidates)
    ? result.data.candidates.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];

  if (candidates.length > 0) {
    return candidates
      .map((candidate, index) => {
        const nome = String(candidate.nome || "").trim() || "Parceiro";
        const details = [
          String(candidate.email || "").trim() ? `email: ${String(candidate.email || "").trim()}` : "",
          String(candidate.whatsappSuffix || "").trim() ? `final do WhatsApp: ${String(candidate.whatsappSuffix || "").trim()}` : "",
          !String(candidate.whatsappSuffix || "").trim() && String(candidate.telefoneMasked || "").trim()
            ? `WhatsApp: ${String(candidate.telefoneMasked || "").trim()}`
            : "",
        ]
          .filter(Boolean)
          .join(" | ");
        return `${index + 1}. ${nome}${details ? ` (${details})` : ""}`;
      })
      .join("\n");
  }

  const partner = result.data?.partner;
  if (partner && typeof partner === "object") {
    const partnerRecord = partner as Record<string, unknown>;
    const nome = String(partnerRecord.nome || "").trim();
    if (nome) return `1. ${nome}`;
  }

  return "";
}

function buildPartnerReplyFromToolResult(result: ToolResult): string | null {
  if (result.tool !== "validate_partner") return null;

  const optionsText =
    String(result.data?.candidateOptionsText || "").trim() || formatPartnerCandidatesFromToolResult(result);

  if (result.status === "invalid_input" || result.status === "partner_not_informed") {
    return "Me informe o nome completo ou o WhatsApp do parceiro para eu validar a dupla.";
  }

  if (result.status === "ambiguous" && optionsText) {
    return `Encontrei estas opcoes de parceiro:\n${optionsText}\nVoce pode responder com o numero da opcao, com o email exibido, com o final do WhatsApp ou com o nome completo para eu confirmar qual deles voce quer escolher.`;
  }

  if (result.status === "found_on_play_only" && optionsText) {
    const partner = (result.data?.partner ?? null) as Record<string, unknown> | null;
    const fotoUrl = String(partner?.fotoUrl || "").trim();
    const details = [optionsText, fotoUrl ? `Foto: ${fotoUrl}` : ""].filter(Boolean).join("\n");
    return `Encontrei este parceiro no Play na Quadra:\n${details}\nE esse mesmo? Se sim, eu sigo com ele como parceiro.`;
  }

  if (result.status === "found_without_profile" && optionsText) {
    const partner = (result.data?.partner ?? null) as Record<string, unknown> | null;
    const fotoUrl = String(partner?.fotoUrl || "").trim();
    const details = [optionsText, fotoUrl ? `Foto: ${fotoUrl}` : ""].filter(Boolean).join("\n");
    return `Encontrei este parceiro no sistema:\n${details}\nO cadastro dele ainda nao esta pronto para inscricao. Se for esse mesmo parceiro, eu te explico o que falta ajustar.`;
  }

  if (result.status === "valid") {
    const partner = (result.data?.partner ?? null) as Record<string, unknown> | null;
    if (!partner) return null;

    const nome = String(partner.nome || "").trim();
    const fotoUrl = String(partner.fotoUrl || "").trim();
    const details = [
      nome ? `Nome no cadastro: ${nome}` : "",
      fotoUrl ? `Foto: ${fotoUrl}` : "",
    ].filter(Boolean);

    if (details.length > 0) {
      return `Encontrei este parceiro:\n${details.join("\n")}\nSe estiver certo, eu sigo com a inscricao na categoria selecionada.`;
    }
  }

  if (result.status === "not_found") {
    const partnerName = String(result.data?.partnerName || "").trim();
    const partnerWhatsapp = String(result.data?.partnerWhatsapp || "").trim();
    const reference = partnerName || partnerWhatsapp;
    return reference
      ? `Nao consegui localizar o parceiro com estes dados: ${reference}.\nSe quiser, me envie o nome completo ou o WhatsApp com DDD para eu tentar novamente.`
      : "Nao consegui localizar o parceiro com os dados informados. Me envie o nome completo ou o WhatsApp com DDD para eu tentar novamente.";
  }

  return null;
}

function buildRegistrationReplyFromToolResult(result: ToolResult): string | null {
  if (result.tool !== "create_tournament_registration") return null;

  const tournamentName = String(result.data?.tournamentName || "").trim();
  const categoryName = String(result.data?.categoryName || "").trim();
  const errorDetail = String(result.data?.errorDetail || result.message || "").trim();

  if (result.status === "created") {
    return `Inscricao concluida${categoryName ? ` na categoria ${categoryName}` : ""}${tournamentName ? ` do torneio ${tournamentName}` : ""}.\nEla sera validada pela Gestao do Torneio.\nA organizacao entrara em contato para informar sobre o pagamento.`;
  }

  if (result.status === "category_closed") {
    return `${categoryName || "Esta categoria"} nao esta mais disponivel para inscricao porque os jogos ja foram gerados.${tournamentName ? ` Torneio: ${tournamentName}.` : ""}`;
  }

  if (result.status === "tournament_closed") {
    return `${tournamentName || "Este torneio"} nao esta com inscricoes abertas no momento.`;
  }

  if (result.status === "ai_registration_disabled") {
    return result.message;
  }

  if (result.status === "partner_invalid") {
    return "Nao consegui concluir a inscricao porque o parceiro informado nao esta valido para esta etapa. Posso te mostrar novamente os dados do parceiro para confirmar.";
  }

  if (result.status === "athlete_not_found") {
    return "Nao consegui concluir a inscricao porque nao localizei seu cadastro com seguranca. Posso verificar seus dados cadastrais antes de tentar de novo.";
  }

  if (result.status === "category_not_found") {
    return `Nao consegui concluir a inscricao porque a categoria selecionada nao foi localizada corretamente${tournamentName ? ` no torneio ${tournamentName}` : ""}.`;
  }

  if (result.status === "error") {
    return `Nao consegui concluir a inscricao.${categoryName ? ` Categoria: ${categoryName}.` : ""}${errorDetail ? ` Motivo: ${errorDetail}.` : ""}`;
  }

  return null;
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

  const tournamentIdForExisting =
    threadState.selectedCategory?.tournamentId || threadState.selectedTournament?.id || input.tournamentId || null;
  let proactivePrefix = "";
  if (!threadState.hasShownExistingRegistrations && tournamentIdForExisting) {
    const existing = await getAthleteRegistrationsSummaryForTournament({
      tournamentId: tournamentIdForExisting,
      athleteUserId: input.identity?.userId ?? null,
      email: input.identity?.email ?? null,
      telefone: input.identity?.telefone ?? null,
      whatsapp: whatsapp || null,
    });

    if (existing.athleteId) {
      threadState.hasShownExistingRegistrations = true;
    }

    if (existing.registrations.length > 0) {
      const items = existing.registrations
        .map((r) => `- ${r.categoryName}${r.partnerName ? ` (parceiro: ${r.partnerName})` : ""}`)
        .join("\n");
      proactivePrefix = `Vi que voce ja esta inscrito neste torneio em:\n${items}`;
    }
  }

  const applyProactivePrefix = (replyText: string) => (proactivePrefix ? `${proactivePrefix}\n\n${replyText}` : replyText);

  let finalReply = "";

  if (
    threadState.intent === "registration" &&
    !threadState.selectedCategory?.id &&
    (input.tournamentId ||
      input.tournamentSlug ||
      input.tournamentName ||
      threadState.selectedTournament?.id ||
      threadState.selectedTournament?.slug ||
      threadState.selectedTournament?.nome)
  ) {
    const categoryLookupResult = await executeAiTool(
      "get_available_categories",
      JSON.stringify({
        tournamentId: input.tournamentId || threadState.selectedTournament?.id || undefined,
        tournamentSlug: input.tournamentSlug || threadState.selectedTournament?.slug || undefined,
        tournamentQuery: input.tournamentName || threadState.selectedTournament?.nome || undefined,
      }),
      toolContext
    );
    toolResults.push(categoryLookupResult);
    usedTools.push("get_available_categories");
    updateThreadStateFromToolResult(threadState, "get_available_categories", categoryLookupResult, input);

    let sameTurnPartnerResult: ToolResult | null = null;
    if (threadState.selectedCategory?.id && !isAffirmativeConfirmation(input.messageText)) {
      const inferredPartnerArgs = inferPartnerValidationArgsFromMessage(input.messageText);
      if (messageHasPartnerIdentitySignal(input.messageText, inferredPartnerArgs)) {
        sameTurnPartnerResult = await executeAiTool(
          "validate_partner",
          JSON.stringify(inferredPartnerArgs),
          toolContext
        );
        toolResults.push(sameTurnPartnerResult);
        usedTools.push("validate_partner");
        updateThreadStateFromToolResult(threadState, "validate_partner", sameTurnPartnerResult, input);
      }
    }

    const categoryReply = buildCategoryReplyFromToolResult(categoryLookupResult, threadState.selectedCategory);
    const categoryConfirmationLines = buildCategoryConfirmationLines(categoryLookupResult, threadState.selectedCategory);
    const partnerReply = sameTurnPartnerResult ? buildPartnerReplyFromToolResult(sameTurnPartnerResult) : null;
    if (categoryReply || partnerReply) {
      finalReply = partnerReply && categoryConfirmationLines
        ? `${categoryConfirmationLines.join("\n")}\n${partnerReply}`
        : partnerReply || categoryReply || "";
      finalReply = applyProactivePrefix(finalReply);
      saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: finalReply }]);
      threadStateStore.set(threadId, threadState);

      return {
        ok: (sameTurnPartnerResult ?? categoryLookupResult).ok,
        threadId,
        replyText: finalReply,
        usedTools,
        toolResults,
        conversationState: threadState,
        messageId: input.messageId ?? null,
      };
    }
  }

  if (
    threadState.awaitingField === "partner_confirmation" &&
    isAffirmativeConfirmation(input.messageText) &&
    (threadState.partner?.id || threadState.partner?.nome)
  ) {
    const validationArgs = {
      partnerId: threadState.partner?.id || undefined,
      partnerName: threadState.partner.nome,
    };
    const validationResult = await executeAiTool("validate_partner", JSON.stringify(validationArgs), toolContext);
    toolResults.push(validationResult);
    usedTools.push("validate_partner");
    updateThreadStateFromToolResult(threadState, "validate_partner", validationResult, input);

    if (
      threadState.stage === "ready_to_register" &&
      threadState.selectedCategory?.id &&
      (threadState.selectedCategory?.tournamentId || threadState.selectedTournament?.id) &&
      threadState.partner?.id
    ) {
      const registrationArgs = {
        tournamentId: threadState.selectedCategory.tournamentId || threadState.selectedTournament?.id,
        categoryId: threadState.selectedCategory.id,
        athleteWhatsapp: whatsapp || undefined,
        athletePhone: input.identity?.telefone || undefined,
        athleteEmail: input.identity?.email || undefined,
        athleteUserId: input.identity?.userId || undefined,
        partnerId: threadState.partner.id,
      };
      const registrationResult = await executeAiTool(
        "create_tournament_registration",
        JSON.stringify(registrationArgs),
        toolContext
      );
      toolResults.push(registrationResult);
      usedTools.push("create_tournament_registration");
      updateThreadStateFromToolResult(threadState, "create_tournament_registration", registrationResult, input);
    }

    const lastToolResult = toolResults[toolResults.length - 1] ?? validationResult;
    finalReply =
      buildRegistrationReplyFromToolResult(lastToolResult) ||
      buildPartnerReplyFromToolResult(lastToolResult) ||
      "Recebi sua confirmacao e estou seguindo com a inscricao.";
    finalReply = applyProactivePrefix(finalReply);

    saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: finalReply }]);
    threadStateStore.set(threadId, threadState);

    return {
      ok: lastToolResult.ok,
      threadId,
      replyText: finalReply,
      usedTools,
      toolResults,
      conversationState: threadState,
      messageId: input.messageId ?? null,
    };
  }

  if (threadState.awaitingField === "partner_confirmation" && threadState.partnerCandidates.length > 1) {
    const selectedPartner = resolvePartnerCandidateSelection(input.messageText, threadState.partnerCandidates);
    if (selectedPartner && (selectedPartner.partnerName || selectedPartner.partnerWhatsapp)) {
      const validationResult = await executeAiTool("validate_partner", JSON.stringify(selectedPartner), toolContext);
      toolResults.push(validationResult);
      usedTools.push("validate_partner");
      updateThreadStateFromToolResult(threadState, "validate_partner", validationResult, input);

      finalReply =
        buildPartnerReplyFromToolResult(validationResult) ||
        "Perfeito, ja identifiquei o parceiro escolhido e vou seguir com a inscricao.";
      finalReply = applyProactivePrefix(finalReply);

      saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: finalReply }]);
      threadStateStore.set(threadId, threadState);

      return {
        ok: validationResult.ok,
        threadId,
        replyText: finalReply,
        usedTools,
        toolResults,
        conversationState: threadState,
        messageId: input.messageId ?? null,
      };
    }
  }

  if (!isAffirmativeConfirmation(input.messageText)) {
    const inferredPartnerArgs = inferPartnerValidationArgsFromMessage(input.messageText);
    if (
      shouldForcePartnerValidation({
        state: threadState,
        messageText: input.messageText,
        inferredArgs: inferredPartnerArgs,
      })
    ) {
      const validationResult = await executeAiTool("validate_partner", JSON.stringify(inferredPartnerArgs), toolContext);
      toolResults.push(validationResult);
      usedTools.push("validate_partner");
      updateThreadStateFromToolResult(threadState, "validate_partner", validationResult, input);

      finalReply =
        buildPartnerReplyFromToolResult(validationResult) ||
        "Estou validando esse parceiro para seguir com a inscricao.";
      finalReply = applyProactivePrefix(finalReply);

      saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: finalReply }]);
      threadStateStore.set(threadId, threadState);

      return {
        ok: validationResult.ok,
        threadId,
        replyText: finalReply,
        usedTools,
        toolResults,
        conversationState: threadState,
        messageId: input.messageId ?? null,
      };
    }
  }

  if (
    threadState.stage === "ready_to_register" &&
    isAffirmativeConfirmation(input.messageText) &&
    threadState.selectedCategory?.id &&
    threadState.selectedCategory?.tournamentId &&
    threadState.partner?.id
  ) {
    const registrationArgs = {
      tournamentId: threadState.selectedCategory.tournamentId,
      categoryId: threadState.selectedCategory.id,
      athleteWhatsapp: whatsapp || undefined,
      athletePhone: input.identity?.telefone || undefined,
      athleteEmail: input.identity?.email || undefined,
      athleteUserId: input.identity?.userId || undefined,
      partnerId: threadState.partner.id,
    };

    const result = await executeAiTool("create_tournament_registration", JSON.stringify(registrationArgs), toolContext);
    toolResults.push(result);
    usedTools.push("create_tournament_registration");
    updateThreadStateFromToolResult(threadState, "create_tournament_registration", result, input);

    finalReply =
      buildRegistrationReplyFromToolResult(result) ||
      "Nao consegui concluir a inscricao agora. Posso revisar seus dados e tentar novamente.";
    finalReply = applyProactivePrefix(finalReply);

    saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: finalReply }]);
    threadStateStore.set(threadId, threadState);

    return {
      ok: result.ok,
      threadId,
      replyText: finalReply,
      usedTools,
      toolResults,
      conversationState: threadState,
      messageId: input.messageId ?? null,
    };
  }

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

      const lastToolResult = toolResults[toolResults.length - 1] ?? null;
      const forcedReply = lastToolResult
        ? buildCategoryReplyFromToolResult(lastToolResult, threadState.selectedCategory) ||
          buildPartnerReplyFromToolResult(lastToolResult) ||
          buildRegistrationReplyFromToolResult(lastToolResult)
        : null;
      if (forcedReply) {
        finalReply = forcedReply;
        break;
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
  finalReply = applyProactivePrefix(finalReply);
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
