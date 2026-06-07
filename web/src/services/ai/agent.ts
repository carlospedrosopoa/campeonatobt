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
  messageId?: string | null;
};

type StoredThreadMessage = {
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TOOL_ROUNDS = 4;
const MAX_STORED_MESSAGES = 12;
const threadStore = new Map<string, StoredThreadMessage[]>();

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
  if (explicitThread) return `${channel}:${explicitThread}`;
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
  history: StoredThreadMessage[];
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

function saveThread(threadId: string, history: StoredThreadMessage[]) {
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
  const history = threadStore.get(threadId) ?? [];
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
    return {
      ok: false,
      threadId,
      replyText: availabilityCheck.replyText,
      usedTools: [],
      toolResults: [],
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
    identity: input.identity,
  });

  const client = getOpenAIClient();
  if (!client) {
    const replyText =
      "Nosso atendimento inteligente ainda nao esta configurado. Por favor, tente novamente mais tarde ou fale com a organizacao.";
    saveThread(threadId, [...history, { role: "user", content: input.messageText }, { role: "assistant", content: replyText }]);
    return {
      ok: false,
      threadId,
      replyText,
      usedTools: [],
      toolResults: [],
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
        const result = await executeAiTool(call.function.name, call.function.arguments, toolContext);
        toolResults.push(result);
        usedTools.push(call.function.name);

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

  return {
    ok: true,
    threadId,
    replyText: finalReply,
    usedTools,
    toolResults,
    messageId: input.messageId ?? null,
  };
}
