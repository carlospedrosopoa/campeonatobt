"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EstadoOperacao, JogoOperacao } from "@/services/operacao.service";

export type { EstadoOperacao, JogoOperacao, QuadraOperacao } from "@/services/operacao.service";

/** Estado da operacao do dia, atualizado sozinho a cada `intervaloMs`. */
export function useOperacao(slug: string, categoriaId: string | null, intervaloMs = 5000) {
  const [estado, setEstado] = useState<EstadoOperacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ativo = useRef(true);

  const carregar = useCallback(async () => {
    try {
      const qs = categoriaId ? `?categoriaId=${encodeURIComponent(categoriaId)}` : "";
      const res = await fetch(`/api/v1/torneios/${slug}/operacao${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar a operação");
      if (ativo.current) {
        setEstado(data as EstadoOperacao);
        setErro(null);
      }
    } catch (e: any) {
      if (ativo.current) setErro(e?.message || "Erro inesperado");
    }
  }, [slug, categoriaId]);

  useEffect(() => {
    ativo.current = true;
    void carregar();
    const t = setInterval(() => void carregar(), intervaloMs);
    return () => {
      ativo.current = false;
      clearInterval(t);
    };
  }, [carregar, intervaloMs]);

  return { estado, erro, recarregar: carregar };
}

async function enviar(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Não foi possível concluir");
  return data;
}

export const acoesOperacao = {
  chamar: (slug: string, partidaId: string, quadraNumero: number) => enviar(`/api/v1/torneios/${slug}/operacao/chamar`, "POST", { partidaId, quadraNumero }),
  iniciar: (slug: string, partidaId: string, aquecimentoMin?: number | null) =>
    enviar(`/api/v1/torneios/${slug}/operacao/iniciar`, "POST", { partidaId, aquecimentoMin: aquecimentoMin ?? null }),
  salvarAquecimentoPadrao: (slug: string, aquecimentoMin: number) => enviar(`/api/v1/torneios/${slug}/operacao/config`, "PATCH", { aquecimentoMin }),
  devolver: (slug: string, partidaId: string) => enviar(`/api/v1/torneios/${slug}/painel-quadras/partidas/${partidaId}`, "PATCH", { acao: "retirar" }),
  voltarAguardando: (slug: string, partidaId: string) =>
    enviar(`/api/v1/torneios/${slug}/painel-quadras/partidas/${partidaId}`, "PATCH", { acao: "voltar-aguardando" }),
  async lancarPlacar(slug: string, jogo: JogoOperacao, sets: { a: number; b: number }[]) {
    const detalhesPlacar = sets.map((s, i) => ({ set: i + 1, a: s.a, b: s.b }));
    const r = await enviar(`/api/v1/torneios/${slug}/categorias/${jogo.categoriaId}/partidas/${jogo.id}`, "PUT", { detalhesPlacar });
    if (jogo.fase === "GRUPOS") {
      await fetch(`/api/v1/torneios/${slug}/categorias/${jogo.categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
    }
    return r;
  },
};

/** "há 3 min", "há 1 h 05" */
export function tempoDesde(iso: string | null, agora = Date.now()) {
  if (!iso) return "";
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

/** "4:05" ate o instante informado (0:00 se ja passou) */
export function contagemAte(iso: string | null, agora = Date.now()) {
  if (!iso) return "";
  const s = Math.max(0, Math.ceil((new Date(iso).getTime() - agora) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function emAquecimento(j: { status: string; aquecimentoAte: string | null }, agora = Date.now()) {
  return j.status === "EM_ANDAMENTO" && Boolean(j.aquecimentoAte) && new Date(j.aquecimentoAte!).getTime() > agora;
}

export function minutosDesde(iso: string | null, agora = Date.now()) {
  return iso ? (agora - new Date(iso).getTime()) / 60000 : 0;
}

export function nomeDupla(lista: { nome: string }[]) {
  return lista
    .map((a) => {
      const p = a.nome.trim().split(/\s+/);
      return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0];
    })
    .join(" / ");
}

export function etapaJogo(j: Pick<JogoOperacao, "grupoNome" | "faseNome">) {
  return j.grupoNome || j.faseNome;
}
