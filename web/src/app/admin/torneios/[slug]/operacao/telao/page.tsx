"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { etapaJogo, nomeDupla, tempoDesde, useOperacao, type JogoOperacao } from "@/components/admin/operacao/comum";
import { textoChamada, textoProximo, textoResultado } from "@/lib/operacao-texto";

/**
 * Telao da operacao: quadras e proximos jogos, e a chamada por voz de cada jogo chamado.
 * A voz vem do Azure (rota /locucao); sem Azure configurado, usa a voz do navegador.
 * Navegadores so tocam som depois de um clique: o botao "Ativar som" libera.
 */
export default function TelaoOperacaoPage() {
  const { slug } = useParams<{ slug: string }>();
  const categoriaId = useSearchParams().get("categoria");
  const { estado } = useOperacao(slug, categoriaId, 3000);
  const [somAtivo, setSomAtivo] = useState(false);
  const [falando, setFalando] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const anunciados = useRef<Set<string> | null>(null);
  const resultadosAnunciados = useRef<Set<string> | null>(null);
  const [telaAcordada, setTelaAcordada] = useState(false);
  const fila = useRef<string[]>([]);
  const tocando = useRef(false);
  const azureIndisponivel = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const falarNavegador = useCallback(
    (texto: string) =>
      new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = "pt-BR";
        const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
        if (voz) u.voice = voz;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      }),
    []
  );

  const falar = useCallback(
    async (texto: string) => {
      if (!azureIndisponivel.current) {
        try {
          const res = await fetch(`/api/v1/torneios/${slug}/locucao`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto }),
          });
          if (res.status === 501) azureIndisponivel.current = true;
          if (res.ok) {
            const url = URL.createObjectURL(await res.blob());
            await new Promise<void>((resolve) => {
              const audio = new Audio(url);
              audio.onended = () => resolve();
              audio.onerror = () => resolve();
              void audio.play().catch(() => resolve());
            });
            URL.revokeObjectURL(url);
            return;
          }
        } catch {
          // cai para a voz do navegador
        }
      }
      await falarNavegador(texto);
    },
    [slug, falarNavegador]
  );

  const tocarFila = useCallback(async () => {
    if (tocando.current) return;
    tocando.current = true;
    while (fila.current.length) {
      const texto = fila.current.shift()!;
      setFalando(texto);
      // aviso sonoro curto antes da chamada
      await new Promise((r) => setTimeout(r, 300));
      await falar(texto);
      await new Promise((r) => setTimeout(r, 600));
    }
    setFalando(null);
    tocando.current = false;
  }, [falar]);

  // mantem a tela do aparelho do som acordada enquanto o telao estiver aberto (Screen Wake Lock)
  useEffect(() => {
    if (!somAtivo || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let trava: { release: () => Promise<void> } | null = null;
    let ativo = true;
    const pedir = async () => {
      try {
        trava = await (navigator as any).wakeLock.request("screen");
        if (ativo) setTelaAcordada(true);
        (trava as any)?.addEventListener?.("release", () => ativo && setTelaAcordada(false));
      } catch {
        if (ativo) setTelaAcordada(false);
      }
    };
    void pedir();
    // o navegador solta a trava quando a aba sai da frente; pede de novo ao voltar
    const aoVoltar = () => document.visibilityState === "visible" && void pedir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      document.removeEventListener("visibilitychange", aoVoltar);
      void trava?.release().catch(() => null);
    };
  }, [somAtivo]);

  // detecta chamadas novas e resultados e anuncia
  useEffect(() => {
    if (!estado) return;
    const resultados = estado.encerradosRecentes ?? [];
    if (!resultadosAnunciados.current) {
      resultadosAnunciados.current = new Set(resultados.map((r) => r.id));
    } else {
      // do mais antigo para o mais recente
      for (const r of [...resultados].reverse()) {
        if (resultadosAnunciados.current.has(r.id)) continue;
        resultadosAnunciados.current.add(r.id);
        if (somAtivo) fila.current.push(textoResultado({ quadra: r.quadra, vencedora: r.vencedora, sets: r.sets, wo: r.wo }));
      }
    }
    const chamados = estado.quadras.filter((q) => q.jogo && q.jogo.status === "AGENDADA" && q.jogo.chamadoEm);
    const chave = (j: JogoOperacao) => `${j.id}:${j.chamadoEm}`;
    if (!anunciados.current) {
      // ao abrir o telao, nao repete chamadas antigas
      anunciados.current = new Set(chamados.map((q) => chave(q.jogo!)));
      return;
    }
    const novos = chamados.filter((q) => !anunciados.current!.has(chave(q.jogo!)));
    if (novos.length === 0) {
      void tocarFila();
      return;
    }
    for (const q of novos) {
      anunciados.current.add(chave(q.jogo!));
      if (!somAtivo) continue;
      fila.current.push(
        textoChamada({ quadra: q.numero, categoriaNome: q.jogo!.categoriaNome, etapa: etapaJogo(q.jogo!), equipeA: q.jogo!.equipeA, equipeB: q.jogo!.equipeB })
      );
    }
    const proximo = estado.fila.find((j) => j.pronto) ?? estado.fila[0];
    if (somAtivo && proximo) fila.current.push(textoProximo({ equipeA: proximo.equipeA, equipeB: proximo.equipeB }));
    void tocarFila();
  }, [estado, somAtivo, tocarFila]);

  const proximos = estado?.fila.slice(0, 4) ?? [];

  return (
    <div className="min-h-dvh bg-[#06121c] px-6 py-6 text-white lg:px-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold uppercase tracking-[0.2em] text-[#3fd3f2]">{estado?.torneio.nome}</div>
          <h1 className="font-display text-4xl font-bold lg:text-5xl">{estado?.categoria?.nome ?? "Agora em quadra"}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setSomAtivo((v) => !v);
            if (!somAtivo) void falar("Som ativado.");
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-5 py-3 text-base font-bold",
            somAtivo ? "bg-white/10 text-white" : "animate-pulse bg-[#3fd3f2] text-[#04202b]"
          )}
        >
          {somAtivo ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          {somAtivo ? "Som ativo" : "Ativar som"}
        </button>
        {somAtivo && !telaAcordada && (
          <span className="text-sm font-semibold text-[#f59e0b]">Deixe a tela deste aparelho sempre ligada</span>
        )}
      </header>

      {falando && (
        <div className="mb-6 rounded-2xl bg-[#3fd3f2] px-6 py-4 text-xl font-bold text-[#04202b] lg:text-2xl">{falando}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {estado?.quadras.map((q) => (
          <div key={q.numero} className={cn("rounded-2xl border p-5", q.jogo ? "border-white/15 bg-white/5" : "border-dashed border-white/15")}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-3xl font-bold">{q.nome}</span>
              {q.jogo ? (
                q.jogo.status === "EM_ANDAMENTO" ? (
                  <span className="rounded-full bg-[#17a34a] px-3 py-1 text-sm font-bold">Em jogo · {tempoDesde(q.jogo.iniciadoEm, agora)}</span>
                ) : (
                  <span className="animate-pulse rounded-full bg-[#f59e0b] px-3 py-1 text-sm font-bold text-[#1f1300]">Chamado</span>
                )
              ) : (
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white/70">Livre</span>
              )}
            </div>
            {q.jogo ? (
              <div className="space-y-1 text-xl font-bold leading-tight lg:text-2xl">
                <div>{nomeDupla(q.jogo.equipeA)}</div>
                <div className="text-sm font-semibold text-white/50">contra</div>
                <div>{nomeDupla(q.jogo.equipeB)}</div>
                <div className="pt-2 text-sm font-semibold text-[#3fd3f2]">{etapaJogo(q.jogo)}</div>
              </div>
            ) : (
              <div className="text-lg text-white/50">Aguardando próximo jogo</div>
            )}
          </div>
        ))}
      </div>

      {proximos.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/60">Próximos</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {proximos.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-4 rounded-xl bg-white/5 px-5 py-3">
                <div className="min-w-0 text-lg font-bold">
                  <span className="truncate">{nomeDupla(j.equipeA)}</span> <span className="text-white/40">x</span>{" "}
                  <span className="truncate">{nomeDupla(j.equipeB)}</span>
                </div>
                <span className={cn("shrink-0 text-sm font-bold", j.pronto ? "text-[#4ade80]" : "text-white/50")}>
                  {j.pronto ? "prontos" : `${j.presentes}/${j.total} presentes`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
