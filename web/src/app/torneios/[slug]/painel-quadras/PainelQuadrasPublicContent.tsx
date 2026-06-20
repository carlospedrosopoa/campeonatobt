"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock3, Gamepad2, MapPin, RefreshCw, Tv } from "lucide-react";

type PartidaPublica = {
  id: string;
  categoriaNome: string;
  fase: string;
  faseResumo: string;
  status: string;
  arenaNome: string | null;
  dataHorario: string | null;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  equipeANome: string | null;
  equipeBNome: string | null;
  placarA: number;
  placarB: number;
  quadra: string | null;
};

type ReservaChavePublica = {
  descricao: string;
  categoriaNome: string;
  fase: string;
  grupoNome: string | null;
  partidasPendentes: number;
  partidasEmAndamento: number;
  totalEmAberto: number;
};

type ClassificacaoGrupoPublica = {
  modelo: "SUPER" | "NORMAL";
  grupoNome: string;
  criterioResumo: string;
  equipes: {
    posicao: number;
    equipeId: string;
    equipeNome: string;
    pontos: number;
    jogosJogados: number;
    jogosVencidos: number;
    jogosPerdidos: number;
    saldoGames: number;
    gamesPro: number;
    setsPro: number;
  }[];
};

type QuadraPublica = {
  numero: number;
  nome: string;
  reservaChave: ReservaChavePublica | null;
  partidaAtual: PartidaPublica | null;
  proximaPartidaPrevista: PartidaPublica | null;
  filaPartidas: PartidaPublica[];
  classificacaoGrupo: ClassificacaoGrupoPublica | null;
};

type PainelPublicoPayload = {
  atualizadoEm: string;
  refreshMs: number;
  torneio: {
    id: string;
    nome: string;
    slug: string;
    quadrasAtivas: number;
  };
  stats: {
    quadrasAtivas: number;
    quadrasLivres: number;
    quadrasOcupadas: number;
    quadrasReservadas: number;
    jogosNaFila: number;
    jogosFinalizados: number;
    tempoMedioMinutos: number | null;
  };
  quadras: QuadraPublica[];
};

const REFRESH_MS = 180000;
const HIGHLIGHT_ROTATION_MS = 12000;

function formatDataHora(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHora(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuracaoMinutos(totalMinutos: number | null) {
  if (totalMinutos === null || totalMinutos < 0) return "-";
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  if (!horas) return `${minutos} min`;
  return `${horas}h ${String(minutos).padStart(2, "0")}min`;
}

function tempoDecorrido(iniciadoEm?: string | null, agora = Date.now()) {
  if (!iniciadoEm) return "-";
  const inicio = new Date(iniciadoEm).getTime();
  if (!Number.isFinite(inicio)) return "-";
  const diffMin = Math.max(0, Math.round((agora - inicio) / 60000));
  return formatDuracaoMinutos(diffMin);
}

function placarResumo(partida?: PartidaPublica | null) {
  if (!partida) return null;
  if (partida.status !== "FINALIZADA" && partida.status !== "WO") return null;
  return `${partida.placarA} x ${partida.placarB}`;
}

function prioridadeDestaque(quadra: QuadraPublica) {
  if (quadra.partidaAtual?.status === "EM_ANDAMENTO") return 0;
  if (quadra.partidaAtual?.status === "AGENDADA") return 1;
  if (quadra.proximaPartidaPrevista) return 2;
  return 3;
}

function resumoStatusQuadra(quadra: QuadraPublica) {
  if (quadra.partidaAtual?.status === "EM_ANDAMENTO") return "Em andamento";
  if (quadra.partidaAtual?.status === "AGENDADA") return "Aguardando inicio";
  if (quadra.proximaPartidaPrevista) return "Proximo jogo previsto";
  return "Livre";
}

function resumoFilaItem(partida: PartidaPublica, index: number) {
  if (partida.status === "EM_ANDAMENTO") return index === 0 ? "Agora" : "Em andamento";
  if (partida.status === "AGENDADA") return index === 0 ? "Proxima" : `${index + 1} na fila`;
  return partida.status;
}

export default function PainelQuadrasPublicContent({
  slug,
  nomeTorneio,
  modoInicial,
}: {
  slug: string;
  nomeTorneio: string;
  modoInicial?: "grade" | "destaque";
}) {
  const [painel, setPainel] = useState<PainelPublicoPayload | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [highlightIndex, setHighlightIndex] = useState(0);

  async function carregarPainel() {
    try {
      setErro(null);
      const res = await fetch(`/api/public/torneios/${slug}/painel-quadras`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as PainelPublicoPayload | { error?: string } | null;
      if (!res.ok) throw new Error((payload as any)?.error || "Falha ao carregar painel");
      setPainel(payload as PainelPublicoPayload);
      setAtualizadoEm((payload as PainelPublicoPayload).atualizadoEm);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarPainel();
  }, [slug]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void carregarPainel();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const quadras = useMemo(() => painel?.quadras ?? [], [painel]);
  const isModoDestaque = modoInicial === "destaque";
  const quadrasOrdenadasDestaque = useMemo(
    () =>
      [...quadras].sort((a, b) => {
        const prioridade = prioridadeDestaque(a) - prioridadeDestaque(b);
        if (prioridade !== 0) return prioridade;
        return a.numero - b.numero;
      }),
    [quadras]
  );
  const destaqueAtual = isModoDestaque && quadrasOrdenadasDestaque.length > 0 ? quadrasOrdenadasDestaque[highlightIndex % quadrasOrdenadasDestaque.length] : null;
  const quadrasSecundarias = useMemo(
    () => (destaqueAtual ? quadrasOrdenadasDestaque.filter((quadra) => quadra.nome !== destaqueAtual.nome) : quadras),
    [destaqueAtual, quadras, quadrasOrdenadasDestaque]
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [quadrasOrdenadasDestaque.length]);

  useEffect(() => {
    if (!isModoDestaque || quadrasOrdenadasDestaque.length <= 1) return;
    const timer = window.setInterval(() => {
      setHighlightIndex((current) => (current + 1) % quadrasOrdenadasDestaque.length);
    }, HIGHLIGHT_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [isModoDestaque, quadrasOrdenadasDestaque.length]);

  function avancarQuadraDestaque() {
    if (!isModoDestaque || quadrasOrdenadasDestaque.length <= 1) return;
    setHighlightIndex((current) => (current + 1) % quadrasOrdenadasDestaque.length);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-[1800px] px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Painel de quadras</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">{nomeTorneio}</h1>
            <p className="mt-2 text-sm text-slate-300 md:text-base">Acompanhamento ao vivo das quadras e proximo jogo previsto</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Quadras ativas</div>
              <div className="mt-2 text-2xl font-black">{painel?.stats.quadrasAtivas ?? "-"}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Em andamento</div>
              <div className="mt-2 text-2xl font-black">{painel?.stats.quadrasOcupadas ?? "-"}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Fila geral</div>
              <div className="mt-2 text-2xl font-black">{painel?.stats.jogosNaFila ?? "-"}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-slate-400">Tempo medio</div>
              <div className="mt-2 text-2xl font-black">{formatDuracaoMinutos(painel?.stats.tempoMedioMinutos ?? null)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
            <RefreshCw className="h-4 w-4" />
            Atualizacao automatica a cada 3 minutos
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <Tv className="h-4 w-4" />
              {isModoDestaque ? "Modo destaque" : "Modo grade"}
            </div>
            <a
              href={`/torneios/${slug}/painel-quadras`}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 ${
                !isModoDestaque ? "border-orange-300/40 bg-orange-500/20 text-orange-100" : "border-white/10 bg-white/5 text-slate-200"
              }`}
            >
              Grade
            </a>
            <a
              href={`/torneios/${slug}/painel-quadras?modo=destaque`}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 ${
                isModoDestaque ? "border-orange-300/40 bg-orange-500/20 text-orange-100" : "border-white/10 bg-white/5 text-slate-200"
              }`}
            >
              Destaque
            </a>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <Clock3 className="h-4 w-4" />
              Ultima consulta: {formatDataHora(atualizadoEm)}
            </div>
          </div>
        </div>

        {erro && <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-red-100">{erro}</div>}

        {carregando && !painel ? (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 px-8 py-20 text-center text-xl font-semibold text-slate-300">
            Carregando painel...
          </div>
        ) : null}

        {!carregando && quadras.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-white/15 bg-white/5 px-8 py-20 text-center">
            <Gamepad2 className="mx-auto h-12 w-12 text-slate-500" />
            <div className="mt-4 text-2xl font-bold">Nenhuma quadra ativa neste momento</div>
          </div>
        ) : null}

        {isModoDestaque && destaqueAtual ? (
          <div className="mt-8 space-y-6">
            <section className="rounded-[2rem] border border-orange-300/20 bg-gradient-to-br from-orange-500/15 via-slate-900/70 to-slate-900 p-8 shadow-2xl shadow-black/30">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.25em] text-orange-200">Quadra em destaque</div>
                  <h2 className="mt-2 text-4xl font-black md:text-6xl">{destaqueAtual.nome}</h2>
                  <div className="mt-4 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-base font-bold text-slate-100">
                    {resumoStatusQuadra(destaqueAtual)}
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/20 px-5 py-4 text-right">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Troca automatica</div>
                  <div className="mt-2 text-3xl font-black">{quadrasOrdenadasDestaque.length > 1 ? "12s" : "-"}</div>
                  <div className="mt-1 text-sm text-slate-300">
                    {quadrasOrdenadasDestaque.length > 1 ? "prioridade para quadras em andamento" : "somente uma quadra relevante"}
                  </div>
                  {quadrasOrdenadasDestaque.length > 1 ? (
                    <button
                      type="button"
                      onClick={avancarQuadraDestaque}
                      className="mt-4 inline-flex items-center justify-center rounded-full border border-orange-300/40 bg-orange-500/20 px-4 py-2 text-sm font-bold text-orange-50 hover:bg-orange-500/30"
                    >
                      Proxima quadra
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
                <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-6">
                  <div className="text-sm font-bold uppercase tracking-wider text-amber-200">Jogo atual</div>
                  {destaqueAtual.partidaAtual ? (
                    <div className="mt-5 space-y-5">
                      <div className="text-lg text-amber-50/85">
                        {destaqueAtual.partidaAtual.categoriaNome} • {destaqueAtual.partidaAtual.faseResumo}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-2xl font-black md:text-4xl">
                        <div className="text-right">{destaqueAtual.partidaAtual.equipeANome || "Equipe A"}</div>
                        <div className="text-amber-200">x</div>
                        <div>{destaqueAtual.partidaAtual.equipeBNome || "Equipe B"}</div>
                      </div>
                      {placarResumo(destaqueAtual.partidaAtual) ? (
                        <div className="text-center text-2xl font-black text-amber-100">Placar {placarResumo(destaqueAtual.partidaAtual)}</div>
                      ) : null}
                      <div className="grid gap-3 text-base text-amber-50/90 md:grid-cols-2">
                        <div className="inline-flex items-center gap-2">
                          <MapPin className="h-5 w-5" />
                          {destaqueAtual.partidaAtual.arenaNome || destaqueAtual.nome}
                        </div>
                        <div className="inline-flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          {formatDataHora(destaqueAtual.partidaAtual.dataHorario)}
                        </div>
                        <div className="inline-flex items-center gap-2">
                          <Clock3 className="h-5 w-5" />
                          Inicio: {formatHora(destaqueAtual.partidaAtual.iniciadoEm)}
                        </div>
                        <div className="inline-flex items-center gap-2">
                          <Clock3 className="h-5 w-5" />
                          Decorrido: {tempoDecorrido(destaqueAtual.partidaAtual.iniciadoEm, agora)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 py-16 text-center text-2xl font-semibold text-slate-300">
                      Nenhum jogo acontecendo nesta quadra agora
                    </div>
                  )}
                </div>

                <div className="space-y-5">
                  <div className="rounded-3xl border border-violet-300/20 bg-violet-500/10 p-6">
                    <div className="text-sm font-bold uppercase tracking-wider text-violet-100">Ordem da chave</div>
                    {destaqueAtual.reservaChave ? (
                      <>
                        <div className="mt-3 text-2xl font-black">{destaqueAtual.reservaChave.descricao}</div>
                        <div className="mt-3 text-base text-violet-50/90">
                          Pendentes {destaqueAtual.reservaChave.partidasPendentes} • Em andamento {destaqueAtual.reservaChave.partidasEmAndamento}
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-lg text-slate-200">Sem chave fixa nesta quadra</div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-6">
                    <div className="text-sm font-bold uppercase tracking-wider text-cyan-100">Proximo jogo previsto</div>
                    {destaqueAtual.proximaPartidaPrevista ? (
                      <div className="mt-4 space-y-4">
                        <div className="text-base text-cyan-50/80">
                          {destaqueAtual.proximaPartidaPrevista.categoriaNome} • {destaqueAtual.proximaPartidaPrevista.faseResumo}
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xl font-black md:text-2xl">
                          <div className="text-right">{destaqueAtual.proximaPartidaPrevista.equipeANome || "Equipe A"}</div>
                          <div className="text-cyan-200">x</div>
                          <div>{destaqueAtual.proximaPartidaPrevista.equipeBNome || "Equipe B"}</div>
                        </div>
                        <div className="grid gap-2 text-sm text-cyan-50/90">
                          <div className="inline-flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {destaqueAtual.proximaPartidaPrevista.arenaNome || destaqueAtual.nome}
                          </div>
                          <div className="inline-flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Horario previsto: {formatDataHora(destaqueAtual.proximaPartidaPrevista.dataHorario)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center text-lg font-semibold text-slate-300">
                        {destaqueAtual.reservaChave
                          ? "Sem novo jogo previsto nesta chave no momento"
                          : "Sem previsao automatica para esta quadra"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.15fr]">
                <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-6">
                  <div className="text-sm font-bold uppercase tracking-wider text-emerald-100">Classificacao</div>
                  {destaqueAtual.classificacaoGrupo ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="text-2xl font-black text-white">{destaqueAtual.classificacaoGrupo.grupoNome}</div>
                        <div className="mt-1 text-sm text-emerald-50/80">{destaqueAtual.classificacaoGrupo.criterioResumo}</div>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-white/10">
                        <table className="w-full text-sm">
                          <thead className="bg-black/20 text-emerald-100/80">
                            <tr>
                              <th className="px-3 py-3 text-left font-semibold">#</th>
                              <th className="px-3 py-3 text-left font-semibold">Equipe</th>
                              <th className="px-3 py-3 text-center font-semibold">J</th>
                              {destaqueAtual.classificacaoGrupo.modelo === "SUPER" ? (
                                <>
                                  <th className="px-3 py-3 text-center font-semibold">P</th>
                                  <th className="px-3 py-3 text-center font-semibold">V</th>
                                  <th className="px-3 py-3 text-center font-semibold">SP</th>
                                  <th className="px-3 py-3 text-center font-semibold">SG</th>
                                </>
                              ) : (
                                <>
                                  <th className="px-3 py-3 text-center font-semibold">V</th>
                                  <th className="px-3 py-3 text-center font-semibold">GP</th>
                                  <th className="px-3 py-3 text-center font-semibold">SG</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {destaqueAtual.classificacaoGrupo.equipes.map((equipe) => (
                              <tr key={equipe.equipeId} className="border-t border-white/10">
                                <td className="px-3 py-3 font-black text-emerald-100">{equipe.posicao}</td>
                                <td className="px-3 py-3 font-semibold text-white">{equipe.equipeNome}</td>
                                <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.jogosJogados}</td>
                                {destaqueAtual.classificacaoGrupo.modelo === "SUPER" ? (
                                  <>
                                    <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.pontos}</td>
                                    <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.jogosVencidos}</td>
                                    <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.setsPro}</td>
                                    <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.saldoGames}</td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.jogosVencidos}</td>
                                    <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.gamesPro}</td>
                                    <td className="px-3 py-3 text-center text-emerald-50/90">{equipe.saldoGames}</td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center text-lg font-semibold text-slate-300">
                      Classificacao indisponivel para a quadra em destaque neste momento
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-fuchsia-300/20 bg-fuchsia-500/10 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold uppercase tracking-wider text-fuchsia-100">Fila de jogos</div>
                    <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-fuchsia-50">
                      {destaqueAtual.filaPartidas.length} jogo(s)
                    </div>
                  </div>
                  {destaqueAtual.filaPartidas.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {destaqueAtual.filaPartidas.slice(0, 6).map((partida, index) => (
                        <div key={partida.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-black text-white">
                                {partida.equipeANome || "Equipe A"} x {partida.equipeBNome || "Equipe B"}
                              </div>
                              <div className="mt-1 text-sm text-fuchsia-50/80">
                                {partida.categoriaNome} • {partida.faseResumo}
                              </div>
                            </div>
                            <div className="rounded-full border border-white/10 bg-fuchsia-500/20 px-3 py-1 text-xs font-bold text-fuchsia-50">
                              {resumoFilaItem(partida, index)}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-fuchsia-50/85 md:grid-cols-2">
                            <div className="inline-flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {partida.arenaNome || destaqueAtual.nome}
                            </div>
                            <div className="inline-flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {formatDataHora(partida.dataHorario)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center text-lg font-semibold text-slate-300">
                      Nenhum jogo em fila para esta quadra agora
                    </div>
                  )}
                </div>
              </div>
            </section>

            {quadrasSecundarias.length > 0 ? (
              <section>
                <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Demais quadras</div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {quadrasSecundarias.map((quadra) => (
                    <div key={quadra.nome} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Quadra</div>
                          <div className="mt-1 text-2xl font-black">{quadra.nome}</div>
                        </div>
                        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-200">
                          {resumoStatusQuadra(quadra)}
                        </div>
                      </div>
                      <div className="mt-4 text-sm text-slate-200">
                        {quadra.partidaAtual ? (
                          <>
                            <div className="font-semibold">{quadra.partidaAtual.equipeANome || "Equipe A"} x {quadra.partidaAtual.equipeBNome || "Equipe B"}</div>
                            <div className="mt-1 text-slate-400">{quadra.partidaAtual.categoriaNome} • {quadra.partidaAtual.faseResumo}</div>
                          </>
                        ) : quadra.proximaPartidaPrevista ? (
                          <>
                            <div className="font-semibold">{quadra.proximaPartidaPrevista.equipeANome || "Equipe A"} x {quadra.proximaPartidaPrevista.equipeBNome || "Equipe B"}</div>
                            <div className="mt-1 text-slate-400">Previsto • {quadra.proximaPartidaPrevista.categoriaNome} • {quadra.proximaPartidaPrevista.faseResumo}</div>
                          </>
                        ) : (
                          <div className="text-slate-400">Sem jogo no momento</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-2">
            {quadras.map((quadra) => {
            const partidaAtual = quadra.partidaAtual;
            const proxima = quadra.proximaPartidaPrevista;
            const statusAtual = resumoStatusQuadra(quadra);
            return (
              <section key={quadra.nome} className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Quadra</div>
                    <h2 className="mt-1 text-3xl font-black">{quadra.nome}</h2>
                    <div className="mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-slate-200">
                      {statusAtual}
                    </div>
                  </div>
                  {quadra.reservaChave ? (
                    <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-right">
                      <div className="text-xs uppercase tracking-wider text-violet-200">Ordem da chave</div>
                      <div className="mt-1 text-lg font-bold text-white">{quadra.reservaChave.descricao}</div>
                      <div className="mt-1 text-sm text-violet-100">
                        Pendentes {quadra.reservaChave.partidasPendentes} • Em andamento {quadra.reservaChave.partidasEmAndamento}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right text-sm text-slate-300">
                      Sem chave fixa nesta quadra
                    </div>
                  )}
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-2">
                  <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-5">
                    <div className="text-sm font-bold uppercase tracking-wider text-amber-200">Jogo atual</div>
                    {partidaAtual ? (
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="text-sm text-amber-100/80">{partidaAtual.categoriaNome} • {partidaAtual.faseResumo}</div>
                          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xl font-black md:text-2xl">
                            <div className="text-right">{partidaAtual.equipeANome || "Equipe A"}</div>
                            <div className="text-amber-200">x</div>
                            <div>{partidaAtual.equipeBNome || "Equipe B"}</div>
                          </div>
                          {placarResumo(partidaAtual) ? (
                            <div className="mt-3 text-center text-lg font-bold text-amber-100">Placar {placarResumo(partidaAtual)}</div>
                          ) : null}
                        </div>
                        <div className="grid gap-2 text-sm text-amber-50/90 md:grid-cols-2">
                          <div className="inline-flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {partidaAtual.arenaNome || quadra.nome}
                          </div>
                          <div className="inline-flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {formatDataHora(partidaAtual.dataHorario)}
                          </div>
                          <div className="inline-flex items-center gap-2">
                            <Clock3 className="h-4 w-4" />
                            Inicio: {formatHora(partidaAtual.iniciadoEm)}
                          </div>
                          <div className="inline-flex items-center gap-2">
                            <Clock3 className="h-4 w-4" />
                            Decorrido: {tempoDecorrido(partidaAtual.iniciadoEm, agora)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-12 text-center text-lg font-semibold text-slate-300">
                        Nenhum jogo acontecendo nesta quadra agora
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-5">
                    <div className="text-sm font-bold uppercase tracking-wider text-cyan-100">Proximo jogo previsto</div>
                    {proxima ? (
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="text-sm text-cyan-50/80">{proxima.categoriaNome} • {proxima.faseResumo}</div>
                          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xl font-black md:text-2xl">
                            <div className="text-right">{proxima.equipeANome || "Equipe A"}</div>
                            <div className="text-cyan-200">x</div>
                            <div>{proxima.equipeBNome || "Equipe B"}</div>
                          </div>
                        </div>
                        <div className="grid gap-2 text-sm text-cyan-50/90">
                          <div className="inline-flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {proxima.arenaNome || quadra.nome}
                          </div>
                          <div className="inline-flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Horario previsto: {formatDataHora(proxima.dataHorario)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-12 text-center text-lg font-semibold text-slate-300">
                        {quadra.reservaChave
                          ? "Sem novo jogo previsto nesta chave no momento"
                          : "Sem previsao automatica para esta quadra"}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
