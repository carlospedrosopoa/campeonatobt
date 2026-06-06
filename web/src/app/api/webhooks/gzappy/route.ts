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

    const inbound = parseIncomingGzappyPayload(payload);
    if (!inbound) {
      return NextResponse.json({ ok: true, ignored: true, reason: "payload_sem_telefone" }, { status: 200 });
    }

    if (inbound.fromMe) {
      return NextResponse.json({ ok: true, ignored: true, reason: "mensagem_saida" }, { status: 200 });
    }

    if (!inbound.text) {
      return NextResponse.json({ ok: true, ignored: true, reason: "mensagem_sem_texto" }, { status: 200 });
    }

    const agentResult = await runTournamentRegistrationAgent({
      whatsapp: inbound.whatsapp,
      contactName: inbound.contactName,
      messageText: inbound.text,
      messageId: inbound.messageId,
    });

    const outbound = agentResult.replyText
      ? await enviarMensagemGzappy({
          destinatario: inbound.whatsapp,
          mensagem: agentResult.replyText,
        })
      : null;

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
