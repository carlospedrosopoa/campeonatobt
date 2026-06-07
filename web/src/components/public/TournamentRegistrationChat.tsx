"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, SendHorizonal, User, Mail, Phone, X } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type StoredChatState = {
  threadId: string;
  identity: {
    nome: string;
    email: string;
    telefone: string;
  };
  messages: ChatMessage[];
};

type Props = {
  tournamentSlug: string;
  tournamentName: string;
  categorySlug?: string | null;
  categoryName?: string | null;
};

function formatMessageContent(content: string) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLinkValue(value: string) {
  return /^https?:\/\//i.test(value) || /^\/[a-z0-9/_-]+$/i.test(value);
}

function normalizeClickableLink(value: string) {
  return String(value || "").trim().replace(/[),.;!?]+$/g, "");
}

function toHref(value: string) {
  const normalized = normalizeClickableLink(value);
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (/^\//.test(normalized) && typeof window !== "undefined") return new URL(normalized, window.location.origin).toString();
  return normalized;
}

function renderLineValue(value: string, key: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalizedLink = normalizeClickableLink(trimmed);

  if (isLinkValue(normalizedLink)) {
    return (
      <a
        key={key}
        href={toHref(normalizedLink)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800"
      >
        {normalizedLink.startsWith("/") ? "Abrir perfil" : "Abrir link"}
      </a>
    );
  }

  return <div key={key} className="text-[13px] leading-5 text-slate-700 break-words">{trimmed}</div>;
}

function renderAssistantMessage(content: string) {
  const lines = formatMessageContent(content)
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, arr) => line.length > 0 || arr[index - 1]?.length > 0);

  return lines.map((line, index) => {
    if (!line) {
      return <div key={`space-${index}`} className="h-1.5" />;
    }

    if (/^valor\b/i.test(line)) {
      return (
        <div key={`value-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">
          {line}
        </div>
      );
    }

    if (/^(categorias disponiveis|categorias abertas|programacao|proximo passo|pr[oó]ximo passo)\b/i.test(line)) {
      return (
        <div key={`label-${index}`} className="pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {line}
        </div>
      );
    }

    const labeledMatch = line.match(
      /^(cadastro|status|foto|faltando|perfil|link do perfil|criar conta|categoria selecionada|torneio|pr[oó]ximo passo)\s*:\s*(.+)$/i
    );
    if (labeledMatch) {
      const label = labeledMatch[1];
      const value = labeledMatch[2];
      return (
        <div key={`info-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
          {renderLineValue(value, `info-value-${index}`)}
        </div>
      );
    }

    if (line.startsWith("• ")) {
      return (
        <div key={`item-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] leading-5 text-slate-700 shadow-sm">
          {line.slice(2)}
        </div>
      );
    }

    const inlineParts = line.split(/(https?:\/\/\S+|\/atleta\/perfil\b)/g).filter(Boolean);
    if (inlineParts.length > 1) {
      return (
        <div key={`text-${index}`} className="text-[13px] leading-6 text-slate-700 whitespace-pre-wrap break-words">
          {inlineParts.map((part, partIndex) => {
            const normalizedLink = normalizeClickableLink(part);
            if (isLinkValue(normalizedLink)) {
              return (
                <a
                  key={`link-${index}-${partIndex}`}
                  href={toHref(normalizedLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-slate-900 underline underline-offset-2"
                >
                  {normalizedLink}
                </a>
              );
            }
            return <Fragment key={`part-${index}-${partIndex}`}>{part}</Fragment>;
          })}
        </div>
      );
    }

    return (
      <div key={`text-${index}`} className="text-[13px] leading-6 text-slate-700 whitespace-pre-wrap break-words">
        {line}
      </div>
    );
  });
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

export default function TournamentRegistrationChat(props: Props) {
  const welcomeMessage = useMemo(
    () =>
      createMessage(
        "assistant",
        props.categoryName
          ? `Oi! Posso te ajudar na inscricao da categoria ${props.categoryName} no torneio ${props.tournamentName}.`
          : `Oi! Posso te ajudar na inscricao do torneio ${props.tournamentName}.`
      ),
    [props.categoryName, props.tournamentName]
  );
  const storageKey = useMemo(
    () => `registration-chat:${props.tournamentSlug}:${props.categorySlug || "torneio"}`,
    [props.categorySlug, props.tournamentSlug]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [didTryPrefill, setDidTryPrefill] = useState(false);
  const [threadId, setThreadId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [identity, setIdentity] = useState({
    nome: "",
    email: "",
    telefone: "",
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredChatState;
      if (parsed.threadId) setThreadId(parsed.threadId);
      if (parsed.identity) {
        setIdentity({
          nome: parsed.identity.nome || "",
          email: parsed.identity.email || "",
          telefone: parsed.identity.telefone || "",
        });
      }
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        setMessages(parsed.messages);
      }
    } catch {
      setMessages([welcomeMessage]);
    }
  }, [storageKey, welcomeMessage]);

  useEffect(() => {
    try {
      const payload: StoredChatState = {
        threadId,
        identity,
        messages,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {}
  }, [identity, messages, storageKey, threadId]);

  useEffect(() => {
    if (!isOpen || didTryPrefill) return;
    setDidTryPrefill(true);
    void (async () => {
      try {
        const res = await fetch("/api/v1/atleta/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as any;
        if (!data) return;
        setIdentity((current) => ({
          nome: current.nome || String(data.nome || ""),
          email: current.email || String(data.email || ""),
          telefone: current.telefone || String(data.telefone || ""),
        }));
      } catch {}
    })();
  }, [didTryPrefill, isOpen]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, isOpen]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isSending) return;

    const userMessage = createMessage("user", text);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/public/ai/registration-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadId || null,
          messageText: text,
          tournamentSlug: props.tournamentSlug,
          tournamentName: props.tournamentName,
          categorySlug: props.categorySlug || null,
          categoryName: props.categoryName || null,
          identity,
        }),
      });

      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        throw new Error(data?.error || "Nao foi possivel responder agora.");
      }

      if (data?.threadId) setThreadId(String(data.threadId));
      setMessages((current) => [
        ...current,
        createMessage("assistant", String(data?.replyText || "Recebi sua mensagem. Vamos continuar sua inscricao.")),
      ]);
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        createMessage("assistant", error?.message || "Nao consegui responder agora. Tente novamente em instantes."),
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function resetChat() {
    setThreadId("");
    setMessages([welcomeMessage]);
    setInput("");
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg ring-1 ring-slate-700/20 hover:bg-slate-800 sm:bottom-4"
      >
        <MessageCircle className="h-4 w-4" />
        Atendimento virtual
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 sm:bg-transparent">
          <div className="fixed inset-x-3 bottom-3 top-20 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:bottom-4 sm:right-4 sm:top-auto sm:h-[640px] sm:w-[380px]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
              <div>
                <div className="text-sm font-bold">Atendimento virtual</div>
                <div className="text-xs text-slate-300">{props.categoryName || props.tournamentName}</div>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Agilize sua inscricao</div>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <input
                    value={identity.nome}
                    onChange={(e) => setIdentity((current) => ({ ...current, nome: e.target.value }))}
                    placeholder="Seu nome"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input
                    value={identity.email}
                    onChange={(e) => setIdentity((current) => ({ ...current, email: e.target.value }))}
                    placeholder="Seu email"
                    inputMode="email"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <input
                    value={identity.telefone}
                    onChange={(e) => setIdentity((current) => ({ ...current, telefone: e.target.value }))}
                    placeholder="Seu WhatsApp ou telefone"
                    inputMode="tel"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-white px-3 py-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm ${
                      message.role === "user"
                        ? "bg-orange-500 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="space-y-2">{renderAssistantMessage(message.content)}</div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{formatMessageContent(message.content)}</div>
                    )}
                  </div>
                </div>
              ))}

              {isSending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Respondendo...
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-100 bg-white p-3">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={2}
                  placeholder="Digite sua mensagem..."
                  className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={isSending || !input.trim()}
                  className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <SendHorizonal className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-500">
                <span>Feito para uso rapido no celular.</span>
                <button type="button" onClick={resetChat} className="font-semibold text-slate-600 hover:text-slate-900">
                  Reiniciar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
