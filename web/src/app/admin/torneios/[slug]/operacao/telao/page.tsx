"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { etapaJogo, nomeDupla, tempoDesde, useOperacao, type JogoOperacao } from "@/components/admin/operacao/comum";
import { textoChamada, textoChamadaSemQuadra, textoProximo, textoResultado } from "@/lib/operacao-texto";

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
  const [ultimoAnuncio, setUltimoAnuncio] = useState<string | null>(null);
  const [vozUsada, setVozUsada] = useState<"Thalita" | "navegador" | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  // o que ja foi anunciado (ou ignorado por ser antigo)
  const anunciados = useRef<Set<string>>(new Set());
  const [telaAcordada, setTelaAcordada] = useState(false);
  const fila = useRef<string[]>([]);
  const tocando = useRef(false);
  const azureIndisponivel = useRef(false);
  // um unico player, liberado no toque em "Ativar som" (o Android so deixa tocar audio liberado por um toque)
  const player = useRef<HTMLAudioElement | null>(null);
  const [falhaVoz, setFalhaVoz] = useState<string | null>(null);

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
        u.onerror = (ev) => {
          setFalhaVoz(`voz do navegador falhou (${(ev as SpeechSynthesisErrorEvent).error ?? "erro"})`);
          resolve();
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        // alguns Android nao disparam onend: libera a fila depois de um tempo proporcional ao texto
        setTimeout(resolve, 2000 + texto.length * 90);
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
            const audio = player.current ?? new Audio();
            await new Promise<void>((resolve) => {
              audio.onended = () => resolve();
              audio.onerror = () => resolve();
              audio.src = url;
              void audio.play().catch((e) => {
                setFalhaVoz(`áudio bloqueado pelo aparelho (${e?.name ?? "erro"}). Toque em Ativar som de novo.`);
                resolve();
              });
            });
            URL.revokeObjectURL(url);
            setVozUsada("Thalita");
            return;
          }
        } catch {
          // cai para a voz do navegador
        }
      }
      setVozUsada("navegador");
      await falarNavegador(texto);
    },
    [slug, falarNavegador]
  );

  /**
   * Precisa rodar DENTRO do toque (sem await antes): libera a voz do navegador e o player de audio.
   * Depois disso o telao pode falar sozinho a cada chamada.
   */
  function liberarAudio(frase = "Som ativado.") {
    setFalhaVoz(null);
    try {
      const audio = player.current ?? new Audio();
      player.current = audio;
      // wav vazio: so para o aparelho liberar este player
      audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
      void audio.play().catch(() => null);
    } catch {
      // segue com a voz do navegador
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = "pt-BR";
      const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
      if (voz) u.voice = voz;
      u.onerror = (ev) => setFalhaVoz(`voz do navegador falhou (${(ev as SpeechSynthesisErrorEvent).error ?? "erro"})`);
      window.speechSynthesis.speak(u);
      setVozUsada("navegador");
    } else {
      setFalhaVoz("este navegador não tem voz; configure a voz Thalita (Azure)");
    }
  }

  const tocarFila = useCallback(async () => {
    if (tocando.current) return;
    tocando.current = true;
    while (fila.current.length) {
      const texto = fila.current.shift()!;
      setFalando(texto);
      setUltimoAnuncio(texto);
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

  // detecta chamadas e resultados novos e anuncia.
  // Anuncia o que aconteceu ate 90 s atras (pelo relogio do servidor): assim abrir o telao ou ativar o som
  // logo depois da chamada ainda anuncia, e o que e mais antigo nao e repetido.
  useEffect(() => {
    if (!estado) return;
    setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const agoraServidor = new Date(estado.agora ?? Date.now()).getTime();
    const recente = (iso: string | null) => Boolean(iso) && agoraServidor - new Date(iso!).getTime() <= 90_000;
    const vistos = anunciados.current;
    const novos: string[] = [];

    // resultados, do mais antigo para o mais recente
    for (const r of [...(estado.encerradosRecentes ?? [])].reverse()) {
      const chave = `fim:${r.id}`;
      if (vistos.has(chave)) continue;
      if (!recente(r.finalizadoEm)) {
        vistos.add(chave);
        continue;
      }
      if (!somAtivo) continue; // fica para quando o som for ativado (se ainda for recente)
      vistos.add(chave);
      novos.push(textoResultado({ quadra: r.quadra, vencedora: r.vencedora, sets: r.sets, wo: r.wo }));
    }

    // chamadas sem quadra (conferencia de presenca) e chamadas para quadra (mesa de controle)
    const chamadas = [
      ...(estado.chamadosSemQuadra ?? []).map((j) => ({ j, quadra: null as number | null })),
      ...estado.quadras.filter((q) => q.jogo && q.jogo.status === "AGENDADA" && q.jogo.chamadoEm).map((q) => ({ j: q.jogo!, quadra: q.numero })),
    ];
    let houveChamada = false;
    for (const { j, quadra } of chamadas) {
      const chave = `chamada:${j.id}:${quadra ?? ""}:${j.chamadoEm}`;
      if (vistos.has(chave)) continue;
      if (!recente(j.chamadoEm)) {
        vistos.add(chave);
        continue;
      }
      if (!somAtivo) continue;
      vistos.add(chave);
      houveChamada = true;
      const base = { categoriaNome: j.categoriaNome, etapa: etapaJogo(j), equipeA: j.equipeA, equipeB: j.equipeB };
      novos.push(quadra ? textoChamada({ ...base, quadra }) : textoChamadaSemQuadra(base));
    }
    if (houveChamada) {
      const proximo = estado.fila.find((j) => j.pronto && !j.chamadoEm);
      if (proximo) novos.push(textoProximo({ equipeA: proximo.equipeA, equipeB: proximo.equipeB }));
    }

    if (novos.length) {
      fila.current.push(...novos);
      void tocarFila();
    }
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
            if (!somAtivo) liberarAudio();
            setSomAtivo((v) => !v);
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-5 py-3 text-base font-bold",
            somAtivo ? "bg-white/10 text-white" : "animate-pulse bg-[#3fd3f2] text-[#04202b]"
          )}
        >
          {somAtivo ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          {somAtivo ? "Som ativo" : "Ativar som"}
        </button>
        {somAtivo && (
          <button
            type="button"
            onClick={() => liberarAudio("Teste de voz. Atenção, quadra 1!")}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-3 text-sm font-bold text-white"
          >
            Testar voz
          </button>
        )}
        {somAtivo && !telaAcordada && (
          <span className="text-sm font-semibold text-[#f59e0b]">Deixe a tela deste aparelho sempre ligada</span>
        )}
      </header>

      {(falando || ultimoAnuncio) && (
        <div
          className={cn(
            "mb-6 rounded-2xl px-6 py-4 text-xl font-bold lg:text-2xl",
            falando ? "bg-[#3fd3f2] text-[#04202b]" : "bg-white/10 text-white/80"
          )}
        >
          {!falando && <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-white/50">Último anúncio</div>}
          {falando ?? ultimoAnuncio}
        </div>
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
      <footer className="mt-8 text-xs font-semibold text-white/40">
        {atualizadoEm ? `Atualizado às ${atualizadoEm}` : "Conectando…"} · som {somAtivo ? "ativo" : "desligado"}
        {vozUsada ? ` · voz: ${vozUsada}` : ""}
        {falhaVoz && <span className="text-[#f59e0b]"> · {falhaVoz}</span>}
      </footer>
    </div>
  );
}
