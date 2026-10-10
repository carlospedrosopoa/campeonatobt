"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Megaphone, X } from "lucide-react";
import { Alert, Button } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { useTolerancia } from "./prontidao";

type AtletaConferencia = {
  usuarioId: string;
  nome: string;
  lado: "A" | "B";
  presente: boolean;
  origem: string | null;
};

type Detalhe = {
  partidaId: string;
  categoriaNome: string;
  status: string;
  quadra: string | null;
  chamadoEm: string | null;
  toleranciaMin: number;
  data: string;
  atletas: AtletaConferencia[];
};

const ORIGEM: Record<string, string> = {
  QR: "check-in pelo QR",
  APP: "check-in no app",
  PARCEIRO: "informado pelo parceiro",
  ARBITRO: "marcado pelo árbitro",
  ADMIN: "marcado pela organização",
  WHATSAPP: "confirmou no WhatsApp",
};

/**
 * Conferencia dos atletas antes do jogo: marca quem chegou, mostra a tolerancia desde a chamada
 * e libera "Iniciar jogo" com todos presentes. W.O. nunca e automatico: so e sugerido.
 */
export function ConferenciaPresenca({
  slug,
  partidaId,
  titulo,
  onClose,
  onAlterou,
  onIniciar,
  onSugerirWO,
}: {
  slug: string;
  partidaId: string;
  titulo?: string;
  onClose: () => void;
  onAlterou?: () => void;
  /** quando informado, mostra o botao "Iniciar jogo" */
  onIniciar?: () => Promise<void> | void;
  /** quando informado, mostra "Sugerir W.O." depois que a tolerancia estoura */
  onSugerirWO?: () => void;
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/torneios/${slug}/presencas/partidas/${partidaId}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar os atletas do jogo");
      setDetalhe(payload as Detalhe);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    }
  }, [slug, partidaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const tolerancia = useTolerancia(detalhe?.chamadoEm, detalhe?.toleranciaMin ?? 15);

  async function alternar(a: AtletaConferencia) {
    if (!detalhe) return;
    try {
      setSalvando(a.usuarioId);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/presencas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: a.usuarioId, data: detalhe.data, presente: !a.presente }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao registrar presença");
      setDetalhe((d) =>
        d
          ? {
              ...d,
              atletas: d.atletas.map((x) =>
                x.usuarioId === a.usuarioId ? { ...x, presente: !a.presente, origem: !a.presente ? payload?.origem ?? "ARBITRO" : null } : x,
              ),
            }
          : d,
      );
      onAlterou?.();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvando(null);
    }
  }

  async function chamar(acao: "chamar" | "limpar-chamada") {
    try {
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/presencas/partidas/${partidaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao chamar o jogo");
      setDetalhe((d) => (d ? { ...d, chamadoEm: payload?.chamadoEm ? new Date(payload.chamadoEm).toISOString() : null } : d));
      onAlterou?.();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    }
  }

  async function iniciar(forcar: boolean) {
    if (!onIniciar) return;
    if (forcar && !window.confirm("Nem todos os atletas estão marcados como presentes. Iniciar o jogo mesmo assim?")) return;
    try {
      setIniciando(true);
      await onIniciar();
      onClose();
    } catch (e: any) {
      setErro(e?.message || "Não foi possível iniciar o jogo");
    } finally {
      setIniciando(false);
    }
  }

  const faltam = detalhe ? detalhe.atletas.filter((a) => !a.presente).length : 0;
  const todos = Boolean(detalhe && detalhe.atletas.length > 0 && faltam === 0);
  const aguardando = detalhe?.status === "AGENDADA";

  const linhaAtleta = (a: AtletaConferencia) => (
    <button
      key={a.usuarioId}
      type="button"
      onClick={() => void alternar(a)}
      disabled={salvando === a.usuarioId}
      aria-pressed={a.presente}
      className={cn(
        "flex w-full items-center gap-3 border-t border-sand-2 px-4 py-3 text-left first:border-t-0 disabled:opacity-60",
        a.presente ? "bg-white" : "bg-[#fffbf3]",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
          a.presente ? "bg-[#1e7f4f] text-white" : "border-2 border-[#d9d5cc] text-transparent",
        )}
      >
        <Check className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-extrabold text-ink">{a.nome}</span>
        <span className={cn("block text-xs font-bold", a.presente ? "text-[#17663f]" : "text-[#8a4e00]")}>
          {a.presente ? `Presente${a.origem && ORIGEM[a.origem] ? ` · ${ORIGEM[a.origem]}` : ""}` : "Não chegou · toque para marcar"}
        </span>
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(22,24,29,0.5)] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Conferir presença"
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-sand sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 bg-rail px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#a3a7af]">Conferir presença{detalhe ? ` · ${detalhe.categoriaNome}` : ""}</div>
            <div className="font-display text-[28px] font-bold leading-tight">{titulo || detalhe?.quadra || "Jogo"}</div>
          </div>
          <div className="flex items-start gap-3">
            {tolerancia && (
              <div className="text-right">
                <div className={cn("font-display text-[28px] font-bold leading-none tabular-nums", tolerancia.estourou ? "text-[#ff8a5b]" : "text-white")}>
                  {tolerancia.texto}
                </div>
                <div className="text-[11px] font-semibold text-[#a3a7af]">{tolerancia.estourou ? "tolerância estourada" : "tolerância restante"}</div>
              </div>
            )}
            <button type="button" aria-label="Fechar" onClick={onClose} className="rounded-lg p-1.5 text-[#c3c6cd] hover:bg-rail-2 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {erro && <Alert>{erro}</Alert>}
          {!detalhe ? (
            <div className="py-10 text-center text-sm text-muted">Carregando atletas…</div>
          ) : (
            <>
              {(["A", "B"] as const).map((lado, idx) => (
                <div key={lado} className="space-y-2">
                  {idx === 1 && <div className="text-center font-display text-xl font-bold italic text-signal">VS</div>}
                  <div className="overflow-hidden rounded-[14px] border border-line bg-white">
                    {detalhe.atletas.filter((a) => a.lado === lado).map(linhaAtleta)}
                  </div>
                </div>
              ))}

              {aguardando && !detalhe.chamadoEm && (
                <Button className="w-full" onClick={() => void chamar("chamar")} icon={<Megaphone />}>
                  Chamar jogo agora (inicia a tolerância de {detalhe.toleranciaMin} min)
                </Button>
              )}
              {aguardando && detalhe.chamadoEm && (
                <button type="button" onClick={() => void chamar("limpar-chamada")} className="w-full text-center text-xs font-semibold text-muted underline">
                  Desfazer chamada
                </button>
              )}
            </>
          )}
        </div>

        {detalhe && aguardando && (onIniciar || onSugerirWO) && (
          <footer className="space-y-2 border-t border-line bg-paper px-4 py-3">
            {onIniciar &&
              (todos ? (
                <Button variant="primary" className="h-12 w-full text-base" disabled={iniciando} onClick={() => void iniciar(false)}>
                  {iniciando ? "Iniciando…" : "Iniciar jogo"}
                </Button>
              ) : (
                <Button className="h-12 w-full" disabled={iniciando} onClick={() => void iniciar(true)}>
                  Iniciar mesmo assim · faltam {faltam}
                </Button>
              ))}
            {onSugerirWO && tolerancia?.estourou && faltam > 0 && (
              <Button variant="danger" className="w-full" onClick={onSugerirWO}>
                Tolerância estourada · lançar W.O.
              </Button>
            )}
            {tolerancia?.estourou && faltam > 0 && (
              <p className="text-center text-xs text-muted">O W.O. só é lançado se você confirmar no placar.</p>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
