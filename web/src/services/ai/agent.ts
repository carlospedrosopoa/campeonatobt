import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { buildTournamentRegistrationPrompt } from "@/services/ai/prompts";
import { aiTools, executeAiTool, type ToolExecutionContext, type ToolResult } from "@/services/ai/tools";

export type AgentInput = {
  whatsapp: string;
  messageText: string;
  contactName?: string | null;
  messageId?: string | null;
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

function getOpenAIClient() {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function toThreadId(whatsapp: string) {
  return `gzappy:${normalizePhone(whatsapp) || "unknown"}`;
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

export async function runTournamentRegistrationAgent(input: AgentInput): Promise<AgentResult> {
  const whatsapp = normalizePhone(input.whatsapp);
  const threadId = toThreadId(whatsapp);
  const history = threadStore.get(threadId) ?? [];
  const systemPrompt = buildTournamentRegistrationPrompt({
    whatsapp,
    contactName: input.contactName,
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
    whatsapp,
    contactName: input.contactName,
    threadId,
    inboundText: input.messageText,
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
