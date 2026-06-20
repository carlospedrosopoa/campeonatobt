"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock3, Gamepad2, MapPin, RefreshCw } from "lucide-react";

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

type QuadraPublica = {
  numero: number;
  nome: string;
  reservaChave: ReservaChavePublica | null;
  partidaAtual: PartidaPublica | null;
  proximaPartidaPrevista: PartidaPublica | null;
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

export default function PainelQuadrasPublicContent({
  slug,
  nomeTorneio,
}: {
  slug: string;
  nomeTorneio: string;
}) {
  const [painel, setPainel] = useState<PainelPublicoPayload | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

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
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
            <Clock3 className="h-4 w-4" />
            Ultima consulta: {formatDataHora(atualizadoEm)}
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

        <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-2">
          {quadras.map((quadra) => {
            const partidaAtual = quadra.partidaAtual;
            const proxima = quadra.proximaPartidaPrevista;
            const statusAtual =
              partidaAtual?.status === "EM_ANDAMENTO" ? "Em andamento" : partidaAtual?.status === "AGENDADA" ? "Aguardando inicio" : "Livre";
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
      </div>
    </div>
  );
}
