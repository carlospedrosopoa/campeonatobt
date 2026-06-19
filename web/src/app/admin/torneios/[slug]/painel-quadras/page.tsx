"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2, Gamepad2, MapPin, Play, RefreshCw, Save, Timer, Undo2, X } from "lucide-react";

type Arena = {
  id: string;
  nome: string;
};

type PartidaPainel = {
  id: string;
  categoriaId: string;
  categoriaNome: string;
  fase: string;
  grupoId: string | null;
  grupoNome: string | null;
  status: string;
  arenaId: string | null;
  arenaNome: string | null;
  quadra: string | null;
  dataHorario: string | null;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  equipeAId: string;
  equipeBId: string;
  equipeANome: string | null;
  equipeBNome: string | null;
  placarA: number;
  placarB: number;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

type QuadraCard = {
  numero: number;
  nome: string;
  partidaAtual: PartidaPainel | null;
};

type PainelPayload = {
  torneio: {
    id: string;
    nome: string;
    slug: string;
    quadrasAtivas: number;
  };
  arenas: Arena[];
  quadras: QuadraCard[];
  fila: PartidaPainel[];
  historicoRecente: PartidaPainel[];
  stats: {
    quadrasAtivas: number;
    quadrasLivres: number;
    quadrasOcupadas: number;
    quadrasReservadas: number;
    jogosNaFila: number;
    jogosFinalizados: number;
    tempoMedioMinutos: number | null;
  };
};

type PlacarForm = {
  s1a: string;
  s1b: string;
  tb1a: string;
  tb1b: string;
  s2a: string;
  s2b: string;
  tb2a: string;
  tb2b: string;
  s3a: string;
  s3b: string;
};

const statusClass: Record<string, string> = {
  AGENDADA: "bg-blue-50 text-blue-700 border-blue-100",
  EM_ANDAMENTO: "bg-amber-50 text-amber-700 border-amber-100",
  FINALIZADA: "bg-green-50 text-green-700 border-green-100",
  WO: "bg-red-50 text-red-700 border-red-100",
  CANCELADA: "bg-slate-100 text-slate-600 border-slate-200",
};

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

function resumoFase(partida: PartidaPainel) {
  if (partida.fase === "GRUPOS" && partida.grupoNome) return partida.grupoNome;
  return partida.fase;
}

export default function AdminPainelQuadrasPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [painel, setPainel] = useState<PainelPayload | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [quadrasAtivasInput, setQuadrasAtivasInput] = useState("0");
  const [operando, setOperando] = useState<Record<string, boolean>>({});
  const [agora, setAgora] = useState(() => Date.now());

  const [quadraSelecionada, setQuadraSelecionada] = useState<QuadraCard | null>(null);
  const [partidaSelecionadaId, setPartidaSelecionadaId] = useState("");
  const [arenaSelecionadaId, setArenaSelecionadaId] = useState("");
  const [salvandoAlocacao, setSalvandoAlocacao] = useState(false);

  const [editPartida, setEditPartida] = useState<PartidaPainel | null>(null);
  const [salvandoPlacar, setSalvandoPlacar] = useState(false);
  const [erroPlacar, setErroPlacar] = useState<string | null>(null);
  const [formPlacar, setFormPlacar] = useState<PlacarForm>({
    s1a: "",
    s1b: "",
    tb1a: "",
    tb1b: "",
    s2a: "",
    s2b: "",
    tb2a: "",
    tb2b: "",
    s3a: "",
    s3b: "",
  });

  async function carregarPainel() {
    try {
      setCarregando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/painel-quadras`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar painel");
      setPainel(payload as PainelPayload);
      setQuadrasAtivasInput(String(payload?.torneio?.quadrasAtivas ?? 0));
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
    const timer = window.setInterval(() => setAgora(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!quadraSelecionada && !editPartida) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [quadraSelecionada, editPartida]);

  const fila = painel?.fila ?? [];
  const quadras = painel?.quadras ?? [];
  const temQuadraLivre = quadras.some((quadra) => !quadra.partidaAtual);

  const partidaSelecionada = useMemo(
    () => fila.find((partida) => partida.id === partidaSelecionadaId) ?? null,
    [fila, partidaSelecionadaId]
  );

  function abrirAlocacao(quadra: QuadraCard) {
    setQuadraSelecionada(quadra);
    setPartidaSelecionadaId(fila[0]?.id ?? "");
    setArenaSelecionadaId("");
  }

  function fecharAlocacao() {
    setQuadraSelecionada(null);
    setPartidaSelecionadaId("");
    setArenaSelecionadaId("");
  }

  async function salvarConfig() {
    try {
      setSalvandoConfig(true);
      setErro(null);
      const quadrasAtivas = Math.max(0, Math.min(20, Math.trunc(Number(quadrasAtivasInput) || 0)));
      const res = await fetch(`/api/v1/torneios/${slug}/painel-quadras/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quadrasAtivas }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar configuração");
      await carregarPainel();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function operarPartida(partidaId: string, acao: "iniciar" | "retirar" | "voltar-aguardando") {
    try {
      setErro(null);
      setOperando((prev) => ({ ...prev, [partidaId]: true }));
      const res = await fetch(`/api/v1/torneios/${slug}/painel-quadras/partidas/${partidaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao operar a partida");
      await carregarPainel();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setOperando((prev) => {
        const next = { ...prev };
        delete next[partidaId];
        return next;
      });
    }
  }

  async function confirmarAlocacao() {
    if (!quadraSelecionada || !partidaSelecionadaId) return;
    try {
      setSalvandoAlocacao(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/painel-quadras/partidas/${partidaSelecionadaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "alocar",
          quadraNumero: quadraSelecionada.numero,
          arenaId: arenaSelecionadaId || null,
        }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao alocar partida");
      fecharAlocacao();
      await carregarPainel();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoAlocacao(false);
    }
  }

  function abrirModalPlacar(partida: PartidaPainel) {
    const detalhes = Array.isArray(partida.detalhesPlacar) ? partida.detalhesPlacar.slice().sort((a, b) => a.set - b.set) : [];
    const s1 = detalhes.find((item) => item.set === 1);
    const s2 = detalhes.find((item) => item.set === 2);
    const s3 = detalhes.find((item) => item.set === 3);
    setErroPlacar(null);
    setFormPlacar({
      s1a: s1 ? String(s1.a ?? "") : "",
      s1b: s1 ? String(s1.b ?? "") : "",
      tb1a: s1 && s1.tiebreak ? String(s1.tbA ?? "") : "",
      tb1b: s1 && s1.tiebreak ? String(s1.tbB ?? "") : "",
      s2a: s2 ? String(s2.a ?? "") : "",
      s2b: s2 ? String(s2.b ?? "") : "",
      tb2a: s2 && s2.tiebreak ? String(s2.tbA ?? "") : "",
      tb2b: s2 && s2.tiebreak ? String(s2.tbB ?? "") : "",
      s3a: s3 ? String(s3.a ?? "") : "",
      s3b: s3 ? String(s3.b ?? "") : "",
    });
    setEditPartida(partida);
  }

  function updatePlacarField<K extends keyof PlacarForm>(key: K, value: string) {
    setFormPlacar((prev) => ({ ...prev, [key]: value }));
  }

  function toNum(value: string) {
    const v = value.trim();
    if (!v) return null;
    if (!/^-?\d+$/.test(v)) return NaN;
    return Number(v);
  }

  async function salvarPlacarModal() {
    if (!editPartida) return;
    try {
      setSalvandoPlacar(true);
      setErroPlacar(null);

      const detalhes: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }> = [];

      const s1a = toNum(formPlacar.s1a);
      const s1b = toNum(formPlacar.s1b);
      if (s1a === null || s1b === null) throw new Error("Informe o placar do set 1");
      if (Number.isNaN(s1a) || Number.isNaN(s1b)) throw new Error("Placar inválido no set 1");
      const tb1a = toNum(formPlacar.tb1a);
      const tb1b = toNum(formPlacar.tb1b);
      if (tb1a !== null || tb1b !== null) {
        if (tb1a === null || tb1b === null) throw new Error("Informe o tie-break completo do set 1");
        if (Number.isNaN(tb1a) || Number.isNaN(tb1b)) throw new Error("Tie-break inválido no set 1");
        detalhes.push({ set: 1, a: s1a, b: s1b, tiebreak: true, tbA: tb1a, tbB: tb1b });
      } else {
        detalhes.push({ set: 1, a: s1a, b: s1b });
      }

      const s2a = toNum(formPlacar.s2a);
      const s2b = toNum(formPlacar.s2b);
      if (s2a !== null || s2b !== null) {
        if (s2a === null || s2b === null) throw new Error("Informe o placar completo do set 2");
        if (Number.isNaN(s2a) || Number.isNaN(s2b)) throw new Error("Placar inválido no set 2");
        const tb2a = toNum(formPlacar.tb2a);
        const tb2b = toNum(formPlacar.tb2b);
        if (tb2a !== null || tb2b !== null) {
          if (tb2a === null || tb2b === null) throw new Error("Informe o tie-break completo do set 2");
          if (Number.isNaN(tb2a) || Number.isNaN(tb2b)) throw new Error("Tie-break inválido no set 2");
          detalhes.push({ set: 2, a: s2a, b: s2b, tiebreak: true, tbA: tb2a, tbB: tb2b });
        } else {
          detalhes.push({ set: 2, a: s2a, b: s2b });
        }
      }

      const s3a = toNum(formPlacar.s3a);
      const s3b = toNum(formPlacar.s3b);
      if (s3a !== null || s3b !== null) {
        if (s3a === null || s3b === null) throw new Error("Informe o placar completo do set 3");
        if (Number.isNaN(s3a) || Number.isNaN(s3b)) throw new Error("Placar inválido no set 3");
        detalhes.push({ set: 3, a: s3a, b: s3b });
      }

      const res = await fetch(
        `/api/v1/torneios/${slug}/categorias/${editPartida.categoriaId}/partidas/${editPartida.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ detalhesPlacar: detalhes }),
        }
      );
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar placar");

      if (editPartida.fase === "GRUPOS") {
        await fetch(`/api/v1/torneios/${slug}/categorias/${editPartida.categoriaId}/recalcular-classificacao`, {
          method: "POST",
        }).catch(() => null);
      }

      setEditPartida(null);
      await carregarPainel();
    } catch (e: any) {
      setErroPlacar(e?.message || "Erro inesperado");
    } finally {
      setSalvandoPlacar(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href={`/admin/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Painel de quadras</h1>
          <p className="text-sm text-slate-600">{painel?.torneio.nome || "Torneio"} • acompanhamento operacional dos jogos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => carregarPainel()}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-slate-500">Quadras livres</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{painel?.stats.quadrasLivres ?? "-"}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-slate-500">Jogos em andamento</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{painel?.stats.quadrasOcupadas ?? "-"}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-slate-500">Fila de jogos</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{painel?.stats.jogosNaFila ?? "-"}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-slate-500">Tempo médio</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{formatDuracaoMinutos(painel?.stats.tempoMedioMinutos ?? null)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Configuração das quadras</h2>
            <p className="text-sm text-slate-600">Informe quantas quadras estarão ativas no painel deste torneio.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={20}
              value={quadrasAtivasInput}
              onChange={(e) => setQuadrasAtivasInput(e.target.value)}
              className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
            />
            <button
              type="button"
              onClick={salvarConfig}
              disabled={salvandoConfig}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {salvandoConfig ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>

      {painel && painel.stats.quadrasAtivas === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <Gamepad2 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-700">Nenhuma quadra ativa configurada.</p>
          <p className="mt-1 text-sm text-slate-500">Salve a quantidade de quadras acima para começar a operar o painel.</p>
        </div>
      )}

      {painel && painel.stats.quadrasAtivas > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {quadras.map((quadra) => {
            const partida = quadra.partidaAtual;
            return (
              <div key={quadra.nome} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Quadra</div>
                    <div className="text-xl font-bold text-slate-900">{quadra.nome}</div>
                  </div>
                  {partida ? (
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass[partida.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>
                      {partida.status}
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      Livre
                    </span>
                  )}
                </div>

                {!partida ? (
                  <div className="mt-6 flex h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
                    <p className="font-medium text-slate-700">Sem jogo alocado</p>
                    <p className="mt-1 text-sm text-slate-500">Escolha uma partida da fila para colocar nesta quadra.</p>
                    <button
                      type="button"
                      disabled={!fila.length}
                      onClick={() => abrirAlocacao(quadra)}
                      className="mt-4 inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" />
                      Colocar jogo
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">{partida.categoriaNome}</span>
                        <span>{resumoFase(partida)}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-5">
                        <div className="text-right font-bold text-slate-900">{partida.equipeANome || "Equipe A"}</div>
                        <div className="text-sm font-black text-slate-400">X</div>
                        <div className="font-bold text-slate-900">{partida.equipeBNome || "Equipe B"}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <div className="inline-flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        {partida.arenaNome || "Sem arena"}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {formatDataHora(partida.dataHorario)}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                        <Timer className="h-4 w-4 text-slate-400" />
                        Inicio: {partida.iniciadoEm ? formatDataHora(partida.iniciadoEm) : "-"}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                        <Timer className="h-4 w-4 text-slate-400" />
                        Decorrido: {tempoDecorrido(partida.iniciadoEm, agora)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {partida.status === "AGENDADA" && (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(operando[partida.id])}
                            onClick={() => operarPartida(partida.id, "iniciar")}
                            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Play className="h-4 w-4" />
                            Iniciar
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(operando[partida.id])}
                            onClick={() => operarPartida(partida.id, "retirar")}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                            Retirar da quadra
                          </button>
                        </>
                      )}
                      {partida.status === "EM_ANDAMENTO" && (
                        <>
                          <button
                            type="button"
                            onClick={() => abrirModalPlacar(partida)}
                            className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Finalizar jogo
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(operando[partida.id])}
                            onClick={() => operarPartida(partida.id, "voltar-aguardando")}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Undo2 className="h-4 w-4" />
                            Voltar para aguardando
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Fila de jogos</h2>
              <p className="text-sm text-slate-600">Partidas aguardando alocação nas quadras do painel.</p>
            </div>
            {!temQuadraLivre && fila.length > 0 && (
              <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Todas as quadras estão ocupadas
              </span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {fila.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Nenhum jogo aguardando na fila.
              </div>
            ) : (
              fila.map((partida) => (
                <div key={partida.id} className="rounded-lg border border-slate-100 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">{partida.categoriaNome}</span>
                        <span>{resumoFase(partida)}</span>
                        {partida.quadra && (
                          <span className="rounded border border-slate-200 px-2 py-1 text-slate-600">{partida.quadra}</span>
                        )}
                      </div>
                      <div className="font-semibold text-slate-900">
                        {partida.equipeANome || "Equipe A"} x {partida.equipeBNome || "Equipe B"}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDataHora(partida.dataHorario)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {partida.arenaNome || "Sem arena"}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{partida.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Encerrados recentemente</h2>
            <p className="text-sm text-slate-600">Histórico rápido dos últimos jogos finalizados no torneio.</p>
          </div>
          <div className="mt-4 space-y-3">
            {(painel?.historicoRecente ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Ainda não há jogos encerrados com histórico operacional.
              </div>
            ) : (
              painel?.historicoRecente.map((partida) => (
                <div key={partida.id} className="rounded-lg border border-slate-100 px-4 py-4">
                  <div className="text-xs text-slate-500">{partida.categoriaNome} • {resumoFase(partida)}</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {partida.equipeANome || "Equipe A"} x {partida.equipeBNome || "Equipe B"}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    Finalizado em {formatDataHora(partida.finalizadoEm)} {partida.quadra ? `• ${partida.quadra}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {quadraSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Alocar partida</div>
                <h3 className="text-lg font-bold text-slate-900">{quadraSelecionada.nome}</h3>
              </div>
              <button type="button" onClick={fecharAlocacao} className="text-sm text-slate-500 hover:text-slate-800">
                Fechar
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Jogo da fila</label>
                <select
                  value={partidaSelecionadaId}
                  onChange={(e) => setPartidaSelecionadaId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                >
                  <option value="">Selecione uma partida</option>
                  {fila.map((partida) => (
                    <option key={partida.id} value={partida.id}>
                      {partida.categoriaNome} • {resumoFase(partida)} • {partida.equipeANome || "Equipe A"} x {partida.equipeBNome || "Equipe B"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Arena</label>
                <select
                  value={arenaSelecionadaId}
                  onChange={(e) => setArenaSelecionadaId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                >
                  <option value="">Sem arena</option>
                  {(painel?.arenas ?? []).map((arena) => (
                    <option key={arena.id} value={arena.id}>
                      {arena.nome}
                    </option>
                  ))}
                </select>
              </div>

              {partidaSelecionada && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="font-semibold text-slate-900">
                    {partidaSelecionada.equipeANome || "Equipe A"} x {partidaSelecionada.equipeBNome || "Equipe B"}
                  </div>
                  <div className="mt-1">
                    {partidaSelecionada.categoriaNome} • {resumoFase(partidaSelecionada)} • {formatDataHora(partidaSelecionada.dataHorario)}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={fecharAlocacao}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!partidaSelecionadaId || salvandoAlocacao}
                onClick={confirmarAlocacao}
                className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {salvandoAlocacao ? "Alocando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editPartida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Finalizar jogo</div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editPartida.equipeANome || "Equipe A"} x {editPartida.equipeBNome || "Equipe B"}
                </h3>
              </div>
              <button type="button" onClick={() => setEditPartida(null)} className="text-sm text-slate-500 hover:text-slate-800">
                Fechar
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Set 1</label>
                <div className="flex items-center gap-2">
                  <input value={formPlacar.s1a} onChange={(e) => updatePlacarField("s1a", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <span className="text-slate-400">x</span>
                  <input value={formPlacar.s1b} onChange={(e) => updatePlacarField("s1b", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Tie-break 1</label>
                <div className="flex items-center gap-2">
                  <input value={formPlacar.tb1a} onChange={(e) => updatePlacarField("tb1a", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <span className="text-slate-400">x</span>
                  <input value={formPlacar.tb1b} onChange={(e) => updatePlacarField("tb1b", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Set 2</label>
                <div className="flex items-center gap-2">
                  <input value={formPlacar.s2a} onChange={(e) => updatePlacarField("s2a", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <span className="text-slate-400">x</span>
                  <input value={formPlacar.s2b} onChange={(e) => updatePlacarField("s2b", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Tie-break 2</label>
                <div className="flex items-center gap-2">
                  <input value={formPlacar.tb2a} onChange={(e) => updatePlacarField("tb2a", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <span className="text-slate-400">x</span>
                  <input value={formPlacar.tb2b} onChange={(e) => updatePlacarField("tb2b", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Set 3</label>
                <div className="flex items-center gap-2">
                  <input value={formPlacar.s3a} onChange={(e) => updatePlacarField("s3a", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <span className="text-slate-400">x</span>
                  <input value={formPlacar.s3b} onChange={(e) => updatePlacarField("s3b", e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
            </div>

            {erroPlacar && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erroPlacar}</div>}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditPartida(null)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarPlacarModal}
                disabled={salvandoPlacar}
                className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {salvandoPlacar ? "Salvando..." : "Salvar e finalizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
