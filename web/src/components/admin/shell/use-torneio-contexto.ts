"use client";

import { useEffect, useState } from "react";

export type TorneioContexto = {
  torneio: { id: string; nome: string; slug: string; status: string; dataInicio?: string; dataFim?: string; local?: string } | null;
  stats: { inscricoesPendentes?: number; inscricoesTotal?: number } | null;
  categorias: Array<{ id: string; nome: string; genero?: string }>;
};

const cache = new Map<string, TorneioContexto>();

/** Dados leves do torneio atual para o menu lateral e o caminho de navegacao. */
export function useTorneioContexto(slug: string | null) {
  const [dados, setDados] = useState<TorneioContexto | null>(slug ? cache.get(slug) ?? null : null);

  useEffect(() => {
    if (!slug) {
      setDados(null);
      return;
    }
    setDados(cache.get(slug) ?? null);
    let ativo = true;
    (async () => {
      try {
        const res = await fetch(`/api/v1/torneios/${slug}/dashboard`, { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as TorneioContexto;
        const normalizado: TorneioContexto = {
          torneio: payload.torneio ?? null,
          stats: payload.stats ?? null,
          categorias: Array.isArray(payload.categorias) ? payload.categorias : [],
        };
        cache.set(slug, normalizado);
        if (ativo) setDados(normalizado);
      } catch {
        // menu continua funcional sem os dados
      }
    })();
    return () => {
      ativo = false;
    };
  }, [slug]);

  return dados;
}
