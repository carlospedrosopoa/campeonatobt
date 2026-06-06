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

function normalizePhone(value: unknown) {
  return cleanString(value).replace(/\D/g, "");
}

function getNested(obj: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function parseIncomingGzappyPayload(payload: any): ParsedGzappyInbound | null {
  const text = cleanString(
    getNested(payload, [
      "message",
      "text",
      "body",
      "data.message",
      "data.text",
      "data.body",
      "messageData.text",
      "messageData.body",
    ])
  );

  const whatsapp = normalizePhone(
    getNested(payload, [
      "phone",
      "from",
      "sender.phone",
      "sender.number",
      "data.phone",
      "data.from",
      "messageData.phone",
      "messageData.from",
    ])
  );

  const contactName = cleanString(
    getNested(payload, [
      "contactName",
      "sender.name",
      "sender.pushName",
      "data.contactName",
      "data.sender.name",
      "messageData.contactName",
    ])
  );

  const messageId = cleanString(
    getNested(payload, [
      "messageId",
      "id",
      "data.messageId",
      "data.id",
      "messageData.id",
    ])
  );

  const fromMeRaw = getNested(payload, ["fromMe", "isFromMe", "data.fromMe", "messageData.fromMe"]);
  const fromMe = fromMeRaw === true || fromMeRaw === "true" || fromMeRaw === 1 || fromMeRaw === "1";

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
