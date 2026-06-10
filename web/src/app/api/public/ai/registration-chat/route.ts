import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { AgentConversationMessage, ConversationStateSnapshot } from "@/services/ai/agent";
import { runTournamentRegistrationAgent } from "@/services/ai/agent";

export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanHistory(value: unknown): AgentConversationMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map<AgentConversationMessage>((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: cleanString(item?.content),
    }))
    .filter((item) => item.content.length > 0);
}

function cleanConversationState(value: any): ConversationStateSnapshot | null {
  if (!value || typeof value !== "object") return null;

  const cleanedState: ConversationStateSnapshot = {
    intent: cleanString(value.intent) as ConversationStateSnapshot["intent"],
    stage: cleanString(value.stage) as ConversationStateSnapshot["stage"],
    awaitingField: cleanString(value.awaitingField) as ConversationStateSnapshot["awaitingField"],
    hasShownExistingRegistrations: Boolean(value.hasShownExistingRegistrations),
    selectedTournament: value.selectedTournament && typeof value.selectedTournament === "object"
      ? {
          id: cleanString(value.selectedTournament.id) || null,
          nome: cleanString(value.selectedTournament.nome) || null,
          slug: cleanString(value.selectedTournament.slug) || null,
        }
      : null,
    selectedCategory: value.selectedCategory && typeof value.selectedCategory === "object"
      ? {
          id: cleanString(value.selectedCategory.id) || null,
          nome: cleanString(value.selectedCategory.nome) || null,
          slug: cleanString(value.selectedCategory.slug) || null,
          tournamentId: cleanString(value.selectedCategory.tournamentId) || null,
          tournamentName: cleanString(value.selectedCategory.tournamentName) || null,
          tournamentSlug: cleanString(value.selectedCategory.tournamentSlug) || null,
        }
      : null,
    partner: value.partner && typeof value.partner === "object"
      ? {
          id: cleanString(value.partner.id) || null,
          nome: cleanString(value.partner.nome) || null,
          status: cleanString(value.partner.status) as NonNullable<ConversationStateSnapshot["partner"]>["status"],
        }
      : null,
    lastTool: cleanString(value.lastTool) || null,
  };

  return cleanedState;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as any;
    const messageText = cleanString(body?.messageText);

    if (!messageText) {
      return NextResponse.json({ ok: false, error: "messageText é obrigatório" }, { status: 400 });
    }

    const session = await getSession();
    const sessionUser = session?.user ?? null;
    const isAtleta = sessionUser?.perfil === "ATLETA";

    const identity = {
      userId: isAtleta ? cleanString(sessionUser?.id) || null : null,
      nome: cleanString(body?.identity?.nome) || cleanString(sessionUser?.nome) || null,
      email: cleanString(body?.identity?.email) || (isAtleta ? cleanString(sessionUser?.email) || null : null),
      telefone: cleanString(body?.identity?.telefone) || null,
    };

    const missingIdentityFields: string[] = [];
    if (!identity.nome) missingIdentityFields.push("nome");
    if (!identity.email) missingIdentityFields.push("email");
    if (!identity.telefone) missingIdentityFields.push("whatsapp");
    if (missingIdentityFields.length > 0) {
      return NextResponse.json(
        {
          ok: true,
          threadId: cleanString(body?.threadId) || null,
          replyText: `Para usar este recurso, preciso que voce preencha seu Nome, Email e WhatsApp.\nFaltando: ${missingIdentityFields.join(", ")}.`,
          usedTools: [],
          toolResults: [],
          conversationState: cleanConversationState(body?.conversationState),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await runTournamentRegistrationAgent({
      channel: "webchat",
      threadId: cleanString(body?.threadId) || null,
      messageText,
      contactName: identity.nome,
      tournamentId: cleanString(body?.tournamentId) || null,
      tournamentSlug: cleanString(body?.tournamentSlug) || null,
      tournamentName: cleanString(body?.tournamentName) || null,
      categoryId: cleanString(body?.categoryId) || null,
      categorySlug: cleanString(body?.categorySlug) || null,
      categoryName: cleanString(body?.categoryName) || null,
      history: cleanHistory(body?.history),
      conversationState: cleanConversationState(body?.conversationState),
      identity,
    });

    return NextResponse.json(
      {
        ok: true,
        threadId: result.threadId,
        replyText: result.replyText,
        usedTools: result.usedTools,
        toolResults: result.toolResults,
        conversationState: result.conversationState,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Erro no atendimento virtual publico:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno do servidor" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
