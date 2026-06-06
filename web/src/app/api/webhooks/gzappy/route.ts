import { NextRequest, NextResponse } from "next/server";
import { runTournamentRegistrationAgent } from "@/services/ai/agent";
import { enviarMensagemGzappy } from "@/services/gzappy.service";

export const dynamic = "force-dynamic";

type ParsedGzappyInbound = {
  messageId: string | null;
  whatsapp: string;
  contactName: string | null;
  text: string;
  fromMe: boolean;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstDefined<T>(...values: T[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  if (!text) return "";
  return text.replace(/@.+$/, "").replace(/\D/g, "");
}

function getNested(obj: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function getMessageCandidate(payload: any) {
  const candidates = [
    payload?.message,
    payload?.messages?.[0],
    payload?.data?.message,
    payload?.data?.messages?.[0],
    payload?.messageData,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
}

function summarizePayloadForLog(payload: any) {
  const message = getMessageCandidate(payload);
  const textCandidate = cleanString(
    firstDefined(
      message?.message?.conversation,
      message?.message?.extendedTextMessage?.text,
      message?.conversation,
      message?.text,
      message?.body,
      typeof payload?.message === "string" ? payload.message : undefined,
      payload?.text,
      payload?.body
    )
  );

  return {
    topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [],
    event: cleanString(firstDefined(payload?.event, payload?.eventType, payload?.type, payload?.name, payload?.data?.event, payload?.data?.type)) || null,
    hasMessagesArray: Array.isArray(payload?.messages),
    hasDataMessagesArray: Array.isArray(payload?.data?.messages),
    hasMessageObject: Boolean(message),
    rawPhoneSample: cleanString(
      firstDefined(
        message?.phone,
        message?.from,
        message?.to,
        message?.remote_jid,
        message?.remoteJid,
        message?.key?.remoteJid,
        payload?.phone,
        payload?.from,
        payload?.remoteJid,
        payload?.remote_jid,
        payload?.data?.phone,
        payload?.data?.from
      )
    ) || null,
    normalizedPhone: normalizePhone(
      firstDefined(
        message?.phone,
        message?.from,
        message?.to,
        message?.remote_jid,
        message?.remoteJid,
        message?.key?.remoteJid,
        payload?.phone,
        payload?.from,
        payload?.remoteJid,
        payload?.remote_jid,
        payload?.data?.phone,
        payload?.data?.from
      )
    ) || null,
    messageId: cleanString(firstDefined(message?.messageId, message?.id, message?.key?.id, payload?.messageId, payload?.id, payload?.data?.messageId)) || null,
    fromMeRaw: firstDefined(payload?.fromMe, payload?.isFromMe, payload?.data?.fromMe, payload?.data?.key_from_me, message?.fromMe, message?.key?.fromMe, message?.key_from_me),
    direction: cleanString(firstDefined(payload?.direction, payload?.data?.direction, message?.direction)).toUpperCase() || null,
    textPreview: textCandidate ? textCandidate.slice(0, 120) : null,
  };
}

function summarizePayloadDeepForLog(payload: any) {
  const message = getMessageCandidate(payload);

  return {
    dataKeys: payload?.data && typeof payload.data === "object" ? Object.keys(payload.data).slice(0, 30) : [],
    messageKeys: message && typeof message === "object" ? Object.keys(message).slice(0, 40) : [],
    nestedMessageKeys:
      message?.message && typeof message.message === "object" ? Object.keys(message.message).slice(0, 40) : [],
    candidateTexts: {
      messageConversation: cleanString(message?.message?.conversation) || null,
      extendedText: cleanString(message?.message?.extendedTextMessage?.text) || null,
      imageCaption: cleanString(message?.message?.imageMessage?.caption) || null,
      messageText: cleanString(message?.text) || null,
      messageBody: cleanString(message?.body) || null,
      payloadDataText: cleanString(payload?.data?.text) || null,
      payloadDataBody: cleanString(payload?.data?.body) || null,
      payloadDataMessageString: typeof payload?.data?.message === "string" ? cleanString(payload.data.message) : null,
    },
    candidatePhones: {
      messagePhone: cleanString(message?.phone) || null,
      messageFrom: cleanString(message?.from) || null,
      messageTo: cleanString(message?.to) || null,
      messageRemoteJid: cleanString(message?.remoteJid) || cleanString(message?.remote_jid) || null,
      messageKeyRemoteJid: cleanString(message?.key?.remoteJid) || cleanString(message?.key?.remote_jid) || null,
      payloadPhone: cleanString(payload?.phone) || null,
      payloadFrom: cleanString(payload?.from) || null,
      payloadDataPhone: cleanString(payload?.data?.phone) || null,
      payloadDataFrom: cleanString(payload?.data?.from) || null,
    },
    ids: {
      messageId: cleanString(message?.messageId) || cleanString(message?.id) || null,
      messageKeyId: cleanString(message?.key?.id) || cleanString(message?.key_id) || null,
      payloadMessageId: cleanString(payload?.messageId) || cleanString(payload?.data?.messageId) || null,
    },
  };
}

function parseIncomingGzappyPayload(payload: any): ParsedGzappyInbound | null {
  const message = getMessageCandidate(payload);

  const text = cleanString(
    firstDefined(
      message?.message?.conversation,
      message?.message?.extendedTextMessage?.text,
      message?.message?.imageMessage?.caption,
      message?.conversation,
      message?.text,
      message?.body,
      typeof payload?.message === "string" ? payload.message : undefined,
      payload?.text,
      payload?.body,
      typeof payload?.data?.message === "string" ? payload.data.message : undefined,
      payload?.data?.text,
      payload?.data?.body,
      payload?.messageData?.text,
      payload?.messageData?.body
    )
  );

  const whatsapp = normalizePhone(
    firstDefined(
      message?.phone,
      message?.from,
      message?.to,
      message?.remote_jid,
      message?.remoteJid,
      message?.key?.remoteJid,
      message?.key?.remote_jid,
      payload?.phone,
      payload?.from,
      payload?.to,
      payload?.remoteJid,
      payload?.remote_jid,
      payload?.sender?.phone,
      payload?.sender?.number,
      payload?.data?.phone,
      payload?.data?.from,
      payload?.data?.to,
      payload?.data?.remote_jid,
      payload?.messageData?.phone,
      payload?.messageData?.from
    )
  );

  const contactName = cleanString(
    firstDefined(
      message?.push_name,
      message?.pushName,
      payload?.contactName,
      payload?.push_name,
      payload?.pushName,
      payload?.sender?.name,
      payload?.sender?.pushName,
      payload?.data?.contactName,
      payload?.data?.push_name,
      payload?.data?.pushName,
      payload?.data?.sender?.name,
      payload?.messageData?.contactName
    )
  );

  const messageId = cleanString(
    firstDefined(
      message?.messageId,
      message?.id,
      message?.key_id,
      message?.key?.id,
      payload?.messageId,
      payload?.id,
      payload?.data?.messageId,
      payload?.data?.id,
      payload?.data?.key_id,
      payload?.messageData?.id
    )
  );

  const direction = cleanString(firstDefined(payload?.direction, payload?.data?.direction, message?.direction)).toUpperCase();
  const fromMeRaw = firstDefined(
    payload?.fromMe,
    payload?.isFromMe,
    payload?.data?.fromMe,
    payload?.data?.key_from_me,
    message?.fromMe,
    message?.key?.fromMe,
    message?.key_from_me,
    payload?.messageData?.fromMe
  );
  const fromMe =
    direction === "OUTBOUND" ||
    fromMeRaw === true ||
    fromMeRaw === "true" ||
    fromMeRaw === 1 ||
    fromMeRaw === "1";

  if (!whatsapp) return null;

  return {
    messageId: messageId || null,
    whatsapp,
    contactName: contactName || null,
    text,
    fromMe,
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => null)) as any;
    if (!payload) return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });

    const payloadSummary = summarizePayloadForLog(payload);
    const payloadDeepSummary = summarizePayloadDeepForLog(payload);
    console.log("[gzappy:webhook] payload_recebido", payloadSummary);
    console.log("[gzappy:webhook] payload_estrutura", payloadDeepSummary);

    const inbound = parseIncomingGzappyPayload(payload);
    console.log("[gzappy:webhook] inbound_parseado", {
      ok: Boolean(inbound),
      inbound,
    });
    if (!inbound) {
      console.warn("[gzappy:webhook] ignorado", {
        reason: "payload_sem_telefone",
        payloadSummary,
        payloadDeepSummary,
      });
      return NextResponse.json({ ok: true, ignored: true, reason: "payload_sem_telefone" }, { status: 200 });
    }

    if (inbound.fromMe) {
      console.warn("[gzappy:webhook] ignorado", {
        reason: "mensagem_saida",
        inbound,
        payloadSummary,
        payloadDeepSummary,
      });
      return NextResponse.json({ ok: true, ignored: true, reason: "mensagem_saida" }, { status: 200 });
    }

    if (!inbound.text) {
      console.warn("[gzappy:webhook] ignorado", {
        reason: "mensagem_sem_texto",
        inbound,
        payloadSummary,
        payloadDeepSummary,
      });
      return NextResponse.json({ ok: true, ignored: true, reason: "mensagem_sem_texto" }, { status: 200 });
    }

    const agentResult = await runTournamentRegistrationAgent({
      whatsapp: inbound.whatsapp,
      contactName: inbound.contactName,
      messageText: inbound.text,
      messageId: inbound.messageId,
    });
    console.log("[gzappy:webhook] agent_resultado", {
      ok: agentResult.ok,
      threadId: agentResult.threadId,
      usedTools: agentResult.usedTools,
      replyPreview: agentResult.replyText ? agentResult.replyText.slice(0, 200) : null,
    });

    const outbound = agentResult.replyText
      ? await enviarMensagemGzappy({
          destinatario: inbound.whatsapp,
          mensagem: agentResult.replyText,
        })
      : null;
    console.log("[gzappy:webhook] outbound_resultado", outbound);

    return NextResponse.json(
      {
        ok: true,
        inbound: {
          messageId: inbound.messageId,
          whatsapp: inbound.whatsapp,
          contactName: inbound.contactName,
        },
        agent: {
          ok: agentResult.ok,
          threadId: agentResult.threadId,
          replyText: agentResult.replyText,
          usedTools: agentResult.usedTools,
          toolResults: agentResult.toolResults,
        },
        outbound,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Erro no webhook do Gzappy:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno do servidor" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
