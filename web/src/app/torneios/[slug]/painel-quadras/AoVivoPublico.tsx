"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone, Trophy } from "lucide-react";
import type { EstadoOperacao, JogoOperacao } from "@/services/operacao.service";

const nomeCurto = (nome: string) => {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] ?? "";
};
const dupla = (lista: { nome: string }[]) => lista.map((a) => nomeCurto(a.nome)).join(" / ");
const etapa = (j: Pick<JogoOperacao, "grupoNome" | "faseNome">) => j.grupoNome || j.faseNome;

function minutos(desdeIso: string | null, agora: number) {
  if (!desdeIso) return "";
  const m = Math.max(0, Math.floor((agora - new Date(desdeIso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

function contagem(ateIso: string | null, agora: number) {
  if (!ateIso) return "";
  const s = Math.max(0, Math.ceil((new Date(ateIso).getTime() - agora) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Operacao ao vivo para atletas e publico (celular): quadras agora, chamadas recentes, proximos e resultados.
 * Mesmos dados do telao, sem som. Usa o relogio do servidor para as contagens.
 */
export default function AoVivoPublico({ slug, nomeTorneio }: { slug: string; nomeTorneio: string }) {
  const [estado, setEstado] = useState<EstadoOperacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const desvio = useRef(0);

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const enviado = Date.now();
        const res = await fetch(`/api/public/torneios/${slug}/ao-vivo`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Não foi possível carregar");
        if (data?.agora) desvio.current = new Date(data.agora).getTime() - (enviado + (Date.now() - enviado) / 2);
        if (ativo) {
          setEstado(data);
          setErro(null);
        }
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro inesperado");
      }
    };
    void carregar();
    const t = setInterval(carregar, 5000);
    const relogio = setInterval(() => setAgora(Date.now() + desvio.current), 1000);
    return () => {
      ativo = false;
      clearInterval(t);
      clearInterval(relogio);
    };
  }, [slug]);

  // chamadas dos ultimos 2 minutos viram aviso no topo (o celular pode estar sem som)
  const chamadasRecentes = estado
    ? [
        ...estado.quadras
          .filter((q) => q.jogo?.status === "AGENDADA" && q.jogo.chamadoEm)
          .map((q) => ({ jogo: q.jogo!, quadra: q.numero as number | null })),
        ...estado.chamadosSemQuadra.map((j) => ({ jogo: j, quadra: null as number | null })),
      ].filter(({ jogo }) => agora - new Date(jogo.chamadoEm!).getTime() <= 120_000)
    : [];

  return (
    <div className="min-h-dvh bg-[#06121c] px-4 pb-10 pt-16 text-white">
      <header className="mb-4">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#3fd3f2]">Ao vivo</div>
        <h1 className="text-2xl font-extrabold leading-tight">{nomeTorneio}</h1>
        {estado?.categoria ? (
          <div className="mt-1 text-sm font-semibold text-white/60">Em andamento: {estado.categoria.nome}</div>
        ) : (
          estado && <div className="mt-1 text-sm font-semibold text-white/60">Os jogos ainda não começaram a ser chamados.</div>
        )}
      </header>

      {erro && <p className="mb-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{erro}</p>}

      {chamadasRecentes.map(({ jogo, quadra }) => (
        <div key={jogo.id} className="mb-3 animate-pulse rounded-2xl bg-[#f59e0b] px-4 py-3 text-[#1f1300]">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide">
            <Megaphone className="h-4 w-4" /> {quadra ? `Chamado para a quadra ${quadra}` : "Jogo chamado"}
          </div>
          <div className="mt-1 text-base font-extrabold leading-tight">
            {dupla(jogo.equipeA)} x {dupla(jogo.equipeB)}
          </div>
        </div>
      ))}

      {!estado ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Agora em quadra</h2>
            {estado.quadras.length === 0 && <p className="text-sm text-white/50">Nenhuma quadra em operação.</p>}
            {estado.quadras.map((q) => {
              const j = q.jogo;
              const aquecendo = j?.status === "EM_ANDAMENTO" && j.aquecimentoAte && new Date(j.aquecimentoAte).getTime() > agora;
              return (
                <div key={q.numero} className={`rounded-2xl border p-4 ${j ? "border-white/15 bg-white/5" : "border-dashed border-white/10"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-extrabold">{q.nome}</span>
                    {!j ? (
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/60">Livre</span>
                    ) : j.status === "AGENDADA" ? (
                      <span className="rounded-full bg-[#f59e0b] px-2.5 py-0.5 text-xs font-bold text-[#1f1300]">Chamado há {minutos(j.chamadoEm, agora)}</span>
                    ) : aquecendo ? (
                      <span className="rounded-full bg-[#3fd3f2] px-2.5 py-0.5 text-xs font-bold text-[#04202b]">Aquecimento {contagem(j.aquecimentoAte, agora)}</span>
                    ) : (
                      <span className="rounded-full bg-[#17a34a] px-2.5 py-0.5 text-xs font-bold">Em jogo · {minutos(j.aquecimentoAte ?? j.iniciadoEm, agora)}</span>
                    )}
                  </div>
                  {j && (
                    <div className="mt-2 text-[15px] font-bold leading-snug">
                      <div>{dupla(j.equipeA)}</div>
                      <div className="text-xs font-semibold text-white/40">contra</div>
                      <div>{dupla(j.equipeB)}</div>
                      <div className="mt-1 text-xs font-semibold text-[#3fd3f2]">
                        {j.categoriaNome} · {etapa(j)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {estado.fila.length > 0 && (
            <section className="mt-6 space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Próximos</h2>
              {estado.fila.slice(0, 6).map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3">
                  <div className="min-w-0 text-sm font-bold leading-snug">
                    <div className="truncate">{dupla(j.equipeA)}</div>
                    <div className="truncate">{dupla(j.equipeB)}</div>
                  </div>
                  <span className={`shrink-0 text-xs font-bold ${j.pronto ? "text-[#4ade80]" : "text-white/50"}`}>
                    {j.pronto ? "prontos" : `${j.presentes}/${j.total} presentes`}
                  </span>
                </div>
              ))}
            </section>
          )}

          {estado.encerradosRecentes.length > 0 && (
            <section className="mt-6 space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Últimos resultados</h2>
              {estado.encerradosRecentes.map((r) => (
                <div key={r.id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 font-bold">
                    <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
                    <span className="truncate">{dupla(r.vencedora)}</span>
                    <span className="ml-auto shrink-0 tabular-nums">{r.wo ? "W.O." : r.sets.join(" ")}</span>
                  </div>
                  <div className="mt-0.5 truncate pl-6 text-xs text-white/50">
                    venceu {dupla(r.perdedora)}
                    {r.quadra ? ` · quadra ${r.quadra}` : ""}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
