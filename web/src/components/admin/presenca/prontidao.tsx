"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/admin/ui";

export type Prontidao = { presentes: number; total: number; faltando: string[]; chamadoEm: string | null };

/** Carrega a prontidao (atletas presentes / total) de uma lista de jogos do torneio. */
export function useProntidao(slug: string, partidaIds: string[], recarregarChave: unknown = null) {
  const [mapa, setMapa] = useState<Record<string, Prontidao>>({});
  const [toleranciaMin, setToleranciaMin] = useState(15);
  const chaveIds = useMemo(() => Array.from(new Set(partidaIds.filter(Boolean))).sort().join(","), [partidaIds]);

  const recarregar = useCallback(async () => {
    if (!chaveIds) {
      setMapa({});
      return;
    }
    try {
      const res = await fetch(`/api/v1/torneios/${slug}/presencas/prontidao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partidaIds: chaveIds.split(",") }),
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = (await res.json()) as { prontidao: Record<string, Prontidao>; toleranciaMin?: number };
      setMapa(payload.prontidao ?? {});
      if (typeof payload.toleranciaMin === "number") setToleranciaMin(payload.toleranciaMin);
    } catch {
      // sem prontidao, as telas seguem funcionando
    }
  }, [slug, chaveIds]);

  useEffect(() => {
    void recarregar();
  }, [recarregar, recarregarChave]);

  return { prontidao: mapa, toleranciaMin, recarregarProntidao: recarregar };
}

export function estaPronto(p?: Prontidao | null) {
  return Boolean(p && p.total > 0 && p.presentes === p.total);
}

/** Selo "Pronto 4/4" / "Falta: fulano" / "0/4 chegaram". */
export function ProntidaoBadge({ p, className }: { p?: Prontidao | null; className?: string }) {
  if (!p || p.total === 0) return null;
  if (p.presentes === p.total) {
    return (
      <Badge tone="success" dot className={className}>
        Pronto {p.presentes}/{p.total}
      </Badge>
    );
  }
  if (p.presentes === 0) {
    return (
      <Badge tone="neutral" className={className}>
        0/{p.total} chegaram
      </Badge>
    );
  }
  const primeiros = p.faltando.slice(0, 2).map((n) => n.split(/\s+/)[0]);
  const resto = p.faltando.length - primeiros.length;
  return (
    <Badge tone="warning" className={className}>
      Falta: {primeiros.join(", ")}
      {resto > 0 ? ` +${resto}` : ""}
    </Badge>
  );
}

/** Minutos/segundos restantes da tolerancia a partir da chamada. Negativo = estourou. */
export function useTolerancia(chamadoEm: string | null | undefined, toleranciaMin: number) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!chamadoEm) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [chamadoEm]);
  if (!chamadoEm) return null;
  const inicio = new Date(chamadoEm).getTime();
  if (Number.isNaN(inicio)) return null;
  const restanteMs = inicio + toleranciaMin * 60_000 - agora;
  const abs = Math.abs(restanteMs);
  const mm = String(Math.floor(abs / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((abs % 60_000) / 1000)).padStart(2, "0");
  return {
    estourou: restanteMs < 0,
    texto: `${restanteMs < 0 ? "+" : ""}${mm}:${ss}`,
    fracaoUsada: Math.min(1, Math.max(0, 1 - restanteMs / (toleranciaMin * 60_000))),
  };
}
