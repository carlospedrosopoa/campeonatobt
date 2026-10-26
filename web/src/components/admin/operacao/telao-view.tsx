"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { agoraServidor, contagemAte, emAquecimento, etapaJogo, nomeDupla, tempoDesde, useOperacao, type JogoOperacao } from "@/components/admin/operacao/comum";
import {
  PREFIXO_REPETICAO,
  textoChamada,
  textoChamadaSemQuadra,
  textoFimAquecimento,
  textoInicioAquecimento,
  textoProximo,
  textoResultado,
} from "@/lib/operacao-texto";

/** Fala "fim de jogo" no telao. Desligada por enquanto. */
const ANUNCIAR_RESULTADO = false;

/**
 * Telao da operacao: quadras e proximos jogos, e a chamada por voz de cada jogo chamado.
 * A voz vem do Azure (rota /locucao); sem Azure configurado, usa a voz do navegador.
 * Navegadores so tocam som depois de um clique: o botao "Ativar som" libera.
 */
export function TelaoView({ slug, categoriaId, codigo }: { slug: string; categoriaId: string | null; codigo?: string | null }) {
  // com codigo: telao aberto por link sem login (Smart Torneio), pelas rotas publicas
  const c = codigo ? encodeURIComponent(codigo) : null;
  const { estado, erro } = useOperacao(slug, categoriaId, 3000, c ? `/api/public/torneios/${slug}/telao?c=${c}` : undefined);
  const [somAtivo, setSomAtivo] = useState(false);
  const [falando, setFalando] = useState<string | null>(null);
  const [ultimoAnuncio, setUltimoAnuncio] = useState<string | null>(null);
  const [vozUsada, setVozUsada] = useState<"Thalita" | "navegador" | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [agora, setAgora] = useState(agoraServidor);
  // o que ja foi anunciado (ou ignorado por ser antigo)
  const anunciados = useRef<Set<string>>(new Set());
  const [telaAcordada, setTelaAcordada] = useState(false);
  const fila = useRef<string[]>([]);
  const tocando = useRef(false);
  const azureIndisponivel = useRef(false);
  // um unico player, liberado no toque em "Ativar som" (o Android so deixa tocar audio liberado por um toque)
  const player = useRef<HTMLAudioElement | null>(null);
  // audio ja gerado pela Thalita, por texto: repeticoes tocam daqui, sem gerar de novo
  const audiosGerados = useRef<Map<string, string>>(new Map());
  const [falhaVoz, setFalhaVoz] = useState<string | null>(null);
  // QR para o publico abrir a pagina ao vivo no celular
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  useEffect(() => {
    const url = `${window.location.origin}/torneios/${slug}/painel-quadras`;
    import("qrcode")
      .then((QR) => QR.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }))
      .then(setQrSvg)
      .catch(() => setQrSvg(null));
  }, [slug]);

  useEffect(() => {
    const t = setInterval(() => setAgora(agoraServidor()), 1000);
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
      const tocarUrl = (url: string) =>
        new Promise<void>((resolve) => {
          const audio = player.current ?? new Audio();
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          audio.src = url;
          void audio.play().catch((e) => {
            setFalhaVoz(`áudio bloqueado pelo aparelho (${e?.name ?? "erro"}). Toque em Ativar som de novo.`);
            resolve();
          });
        });
      const guardado = audiosGerados.current.get(texto);
      if (guardado) {
        await tocarUrl(guardado);
        return;
      }
      if (!azureIndisponivel.current) {
        try {
          const res = await fetch(c ? `/api/public/torneios/${slug}/telao/locucao?c=${c}` : `/api/v1/torneios/${slug}/locucao`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto }),
          });
          if (res.status === 501) azureIndisponivel.current = true;
          if (res.ok) {
            const url = URL.createObjectURL(await res.blob());
            audiosGerados.current.set(texto, url);
            if (audiosGerados.current.size > 60) {
              const [maisAntigo, urlAntiga] = audiosGerados.current.entries().next().value as [string, string];
              audiosGerados.current.delete(maisAntigo);
              URL.revokeObjectURL(urlAntiga);
            }
            await tocarUrl(url);
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

    // resultados, do mais antigo para o mais recente (locucao desligada por enquanto: o placar so aparece na tela)
    for (const r of ANUNCIAR_RESULTADO ? [...(estado.encerradosRecentes ?? [])].reverse() : []) {
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
    // repete a chamada a cada 3 min (ate 2 vezes) enquanto o jogo nao comecar; reaproveita o audio ja gerado
    for (const q of estado.quadras) {
      const j = q.jogo;
      if (!j || j.status !== "AGENDADA" || !j.chamadoEm) continue;
      PREFIXO_REPETICAO.forEach((prefixo, i) => {
        const momento = new Date(j.chamadoEm!).getTime() + (i + 1) * 180_000;
        const chave = `rep${i + 1}:${j.id}:${j.chamadoEm}`;
        if (vistos.has(chave) || agoraServidor < momento) return;
        if (agoraServidor - momento > 90_000) {
          vistos.add(chave);
          return;
        }
        if (!somAtivo) return;
        vistos.add(chave);
        novos.push(prefixo, textoChamada({ quadra: q.numero, categoriaNome: j.categoriaNome, etapa: etapaJogo(j), equipeA: j.equipeA, equipeB: j.equipeB }));
      });
    }

    // aquecimento: anuncia o inicio (com os minutos) e o fim ("valendo")
    for (const q of estado.quadras) {
      const j = q.jogo;
      if (!j || j.status !== "EM_ANDAMENTO" || !j.aquecimentoAte || !j.aquecimentoMin) continue;
      const chaveInicio = `aq-inicio:${j.id}:${j.iniciadoEm}`;
      if (!vistos.has(chaveInicio)) {
        if (!recente(j.iniciadoEm)) vistos.add(chaveInicio);
        else if (somAtivo) {
          vistos.add(chaveInicio);
          novos.push(textoInicioAquecimento({ quadra: q.numero, minutos: j.aquecimentoMin }));
        }
      }
      const fim = new Date(j.aquecimentoAte).getTime();
      const chaveFim = `aq-fim:${j.id}:${j.aquecimentoAte}`;
      if (!vistos.has(chaveFim) && agoraServidor >= fim) {
        if (agoraServidor - fim > 90_000) vistos.add(chaveFim);
        else if (somAtivo) {
          vistos.add(chaveFim);
          novos.push(textoFimAquecimento({ quadra: q.numero }));
        }
      }
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

  const proximos = estado?.fila.slice(0, 5) ?? [];
  const totalQuadras = estado?.quadras.length ?? 0;
  // modo TV: tudo numa tela; 4 a 6 quadras viram 3 colunas x 2 linhas
  const colunas = totalQuadras <= 1 ? 1 : totalQuadras <= 4 ? 2 : 3;
  const linhas = Math.max(1, Math.ceil(totalQuadras / colunas));
  const destaque = (j: JogoOperacao | null) => Boolean(j && j.status === "AGENDADA" && j.chamadoEm && agora - new Date(j.chamadoEm).getTime() < 20_000);

  return (
    <div className="flex min-h-dvh flex-col bg-[#06121c] px-5 py-5 text-white lg:h-dvh lg:overflow-hidden lg:px-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold uppercase tracking-[0.2em] text-[#3fd3f2]">{estado?.torneio.nome}</div>
          <h1 className="truncate font-display text-3xl font-bold lg:text-[clamp(2rem,3.2vw,3.5rem)]">{estado?.categoria?.nome ?? "Agora em quadra"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {somAtivo && !telaAcordada && <span className="text-sm font-semibold text-[#f59e0b]">Deixe a tela deste aparelho sempre ligada</span>}
          {somAtivo && (
            <button
              type="button"
              onClick={() => liberarAudio("Teste de voz. Atenção, quadra 1!")}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold text-white"
            >
              Testar voz
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!somAtivo) liberarAudio();
              setSomAtivo((v) => !v);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-bold",
              somAtivo ? "bg-white/10 text-white" : "animate-pulse bg-[#3fd3f2] text-[#04202b]"
            )}
          >
            {somAtivo ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            {somAtivo ? "Som ativo" : "Ativar som"}
          </button>
        </div>
      </header>

      {(falando || ultimoAnuncio) && (
        <div
          className={cn(
            "mb-4 rounded-2xl px-6 py-3 font-bold lg:text-[clamp(1.1rem,1.6vw,1.9rem)]",
            falando ? "bg-[#3fd3f2] text-[#04202b]" : "bg-white/10 text-white/80"
          )}
        >
          {!falando && <span className="mr-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50">Último anúncio</span>}
          {falando ?? ultimoAnuncio}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,22vw)]">
        <div
          className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2 lg:[grid-template-columns:var(--colunas)] lg:[grid-template-rows:var(--linhas)]"
          style={{ ["--colunas" as string]: `repeat(${colunas}, minmax(0, 1fr))`, ["--linhas" as string]: `repeat(${linhas}, minmax(0, 1fr))` }}
        >
          {estado?.quadras.map((q) => (
            <div
              key={q.numero}
              className={cn(
                "flex min-h-0 flex-col rounded-2xl border p-5 transition-all",
                q.jogo ? "border-white/15 bg-white/5" : "border-dashed border-white/15",
                destaque(q.jogo) && "scale-[1.02] border-[#f59e0b] bg-[#f59e0b]/15 ring-4 ring-[#f59e0b]"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-display text-[clamp(1.6rem,2.4vw,2.6rem)] font-bold leading-none">{q.nome}</span>
                {q.jogo ? (
                  q.jogo.status === "EM_ANDAMENTO" ? (
                    emAquecimento(q.jogo, agora) ? (
                      <span className="rounded-full bg-[#3fd3f2] px-3 py-1 text-sm font-bold text-[#04202b] lg:text-base">
                        Aquecimento · {contagemAte(q.jogo.aquecimentoAte, agora)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#17a34a] px-3 py-1 text-sm font-bold lg:text-base">
                        Em jogo · {tempoDesde(q.jogo.aquecimentoAte ?? q.jogo.iniciadoEm, agora)}
                      </span>
                    )
                  ) : (
                    <span className="animate-pulse rounded-full bg-[#f59e0b] px-3 py-1 text-sm font-bold text-[#1f1300] lg:text-base">Chamado</span>
                  )
                ) : (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white/70">Livre</span>
                )}
              </div>
              {q.jogo ? (
                <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 text-[clamp(1.1rem,1.7vw,2rem)] font-bold leading-tight">
                  <div className="truncate">{nomeDupla(q.jogo.equipeA)}</div>
                  <div className="text-sm font-semibold text-white/50">contra</div>
                  <div className="truncate">{nomeDupla(q.jogo.equipeB)}</div>
                  <div className="pt-1 text-sm font-semibold text-[#3fd3f2] lg:text-base">{etapaJogo(q.jogo)}</div>
                </div>
              ) : (
                <div className="flex flex-1 items-center text-lg text-white/40">Aguardando próximo jogo</div>
              )}
            </div>
          ))}
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          {estado?.rankingAmericano && estado.rankingAmericano.length > 0 && (
            <section className="shrink-0 rounded-2xl bg-white/5 p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/60">Ranking</h2>
              <ol className="space-y-1.5">
                {estado.rankingAmericano.slice(0, 8).map((l) => (
                  <li key={l.usuarioId} className="flex items-center gap-2 text-[clamp(0.9rem,1vw,1.15rem)] font-bold">
                    <span className={cn("w-6 shrink-0 text-right tabular-nums", l.posicao <= 4 ? "text-[#facc15]" : "text-white/40")}>{l.posicao}</span>
                    <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                    <span className="shrink-0 tabular-nums text-white/80">{l.gamesPro}</span>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/40">{l.saldo > 0 ? `+${l.saldo}` : l.saldo}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11px] font-semibold text-white/40">games vencidos · saldo — os 4 primeiros vão à final</p>
            </section>
          )}
          <section className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white/5 p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/60">Próximos</h2>
            {proximos.length === 0 ? (
              <p className="text-sm text-white/40">Sem jogos na fila.</p>
            ) : (
              <ol className="space-y-3">
                {proximos.map((j, i) => (
                  <li key={j.id} className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <span className="w-5 shrink-0 text-sm font-extrabold text-white/40">{i + 1}</span>
                      <div className="min-w-0 flex-1 text-[clamp(0.95rem,1.1vw,1.25rem)] font-bold leading-snug">
                        <div className="truncate">{nomeDupla(j.equipeA)}</div>
                        <div className="truncate">{nomeDupla(j.equipeB)}</div>
                      </div>
                    </div>
                    <div className={cn("mt-1 pl-7 text-xs font-bold", j.pronto ? "text-[#4ade80]" : "text-white/50")}>
                      {j.pronto ? "prontos" : `${j.presentes}/${j.total} presentes`} · {etapaJogo(j)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {qrSvg && (
            <section className="flex items-center gap-3 rounded-2xl bg-white p-3 text-[#06121c]">
              <div className="h-24 w-24 shrink-0 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="text-sm font-extrabold leading-tight">
                Acompanhe ao vivo no celular
                <div className="mt-1 text-xs font-semibold text-[#06121c]/60">Aponte a câmera</div>
              </div>
            </section>
          )}
        </aside>
      </div>

      <footer className="mt-3 text-xs font-semibold text-white/40">
        {atualizadoEm ? `Atualizado às ${atualizadoEm}` : erro ?? "Conectando…"} · som {somAtivo ? "ativo" : "desligado"}
        {vozUsada ? ` · voz: ${vozUsada}` : ""}
        {falhaVoz && <span className="text-[#f59e0b]"> · {falhaVoz}</span>}
      </footer>
    </div>
  );
}
