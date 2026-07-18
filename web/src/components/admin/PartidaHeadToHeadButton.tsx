"use client";

import { useMemo, useState } from "react";
import { BarChart3, Loader2, Swords, UserRound, X } from "lucide-react";

type AtletaResumo = {
  id: string;
  nome: string;
  fotoUrl: string | null;
  playnaquadraAtletaId: string | null;
};

type TimeResumo = {
  id: string;
  nome: string;
  atletas: AtletaResumo[];
};

type HeadToHeadResponse = {
  partida: {
    id: string;
    fase: string;
    faseLabel: string;
    status: string;
    torneio: {
      id: string;
      nome: string;
      slug: string;
      status: string;
      dataInicio: string | null;
      dataFim: string | null;
    };
    categoria: {
      id: string;
      nome: string;
    };
    duplaA: TimeResumo;
    duplaB: TimeResumo;
  };
  confrontoDuplas: {
    resumo: {
      confrontos: number;
      confrontosConcluidos: number;
      vitoriasDuplaA: number;
      vitoriasDuplaB: number;
      ultimos5: Array<"A" | "B">;
    };
    historico: Array<{
      id: string;
      dataReferencia: string | null;
      torneio: {
        id: string;
        nome: string;
        slug: string;
        status: string;
        dataInicio: string | null;
        dataFim: string | null;
      };
      categoria: {
        id: string;
        nome: string;
      };
      fase: string;
      faseLabel: string;
      status: string;
      resultado: "DUPLA_A" | "DUPLA_B" | null;
      duplaA: TimeResumo;
      duplaB: TimeResumo;
      placar: {
        a: number | null;
        b: number | null;
        detalhes: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }>;
      };
    }>;
  };
  confrontosIndividuais: Array<{
    chave: string;
    atletaA: AtletaResumo;
    atletaB: AtletaResumo;
    resumo: {
      confrontos: number;
      confrontosConcluidos: number;
      vitoriasAtletaA: number;
      vitoriasAtletaB: number;
      ultimos5: Array<"A" | "B">;
      parceirosAtletaA: string[];
      parceirosAtletaB: string[];
    };
    historico: Array<{
      id: string;
      dataReferencia: string | null;
      torneio: {
        id: string;
        nome: string;
        slug: string;
        status: string;
        dataInicio: string | null;
        dataFim: string | null;
      };
      categoria: {
        id: string;
        nome: string;
      };
      fase: string;
      faseLabel: string;
      status: string;
      resultado: "ATLETA_A" | "ATLETA_B" | null;
      atletaAParceiro: AtletaResumo | null;
      atletaBParceiro: AtletaResumo | null;
      duplaAtletaA: TimeResumo;
      duplaAtletaB: TimeResumo;
      placar: {
        a: number | null;
        b: number | null;
        detalhes: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }>;
      };
    }>;
  }>;
};

function formatDataHora(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPlacar(
  detalhes?: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }> | null
) {
  if (!Array.isArray(detalhes) || detalhes.length === 0) return "Sem placar";
  return detalhes
    .slice()
    .sort((a, b) => a.set - b.set)
    .map((set) => {
      if (set.tiebreak && set.tbA !== undefined && set.tbB !== undefined) {
        return `${set.a}-${set.b} (${set.tbA}-${set.tbB})`;
      }
      return `${set.a}-${set.b}`;
    })
    .join(" ");
}

function renderUltimos5(ultimos5: Array<"A" | "B">, labelA: string, labelB: string) {
  if (ultimos5.length === 0) return <span className="text-xs text-slate-500">Sem histórico concluído</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ultimos5.map((item, index) => (
        <span
          key={`${item}-${index}`}
          title={item === "A" ? labelA : labelB}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            item === "A" ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function nomesAtletas(time: TimeResumo) {
  return time.atletas.map((atleta) => atleta.nome).join(" / ");
}

export function PartidaHeadToHeadButton(props: {
  slug: string;
  categoriaId: string;
  partidaId: string;
  compact?: boolean;
}) {
  const { slug, categoriaId, partidaId, compact = false } = props;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<HeadToHeadResponse | null>(null);

  const tituloConfronto = useMemo(() => {
    if (!data) return "Head-to-head";
    return `${data.partida.duplaA.nome} x ${data.partida.duplaB.nome}`;
  }, [data]);

  async function abrir() {
    setOpen(true);
    if (data || loading) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(
        `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${encodeURIComponent(partidaId)}/head-to-head`,
        { cache: "no-store" }
      );
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Não foi possível carregar o head-to-head");
      setData(payload as HeadToHeadResponse);
    } catch (e: any) {
      setError(e?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir()}
        className={
          compact
            ? "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            : "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        }
        title="Ver head-to-head"
      >
        <BarChart3 className="h-4 w-4" />
        {!compact ? "Head-to-head" : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setOpen(false)}>
          <div
            className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-slate-500">Head-to-head da partida</div>
                <div className="truncate text-lg font-bold text-slate-900">{tituloConfronto}</div>
                {data ? (
                  <div className="mt-1 text-sm text-slate-500">
                    {data.partida.categoria.nome} • {data.partida.faseLabel}
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando head-to-head...
                </div>
              ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              ) : data ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Swords className="h-4 w-4" />
                        Confronto entre as duplas
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white p-3 text-center">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Vitórias</div>
                          <div className="mt-1 text-2xl font-bold text-slate-900">{data.confrontoDuplas.resumo.vitoriasDuplaA}</div>
                          <div className="mt-1 text-xs text-slate-600">{nomesAtletas(data.partida.duplaA)}</div>
                        </div>
                        <div className="rounded-xl bg-white p-3 text-center">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Vitórias</div>
                          <div className="mt-1 text-2xl font-bold text-slate-900">{data.confrontoDuplas.resumo.vitoriasDuplaB}</div>
                          <div className="mt-1 text-xs text-slate-600">{nomesAtletas(data.partida.duplaB)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">
                          {data.confrontoDuplas.resumo.confrontos} confronto(s)
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">
                          {data.confrontoDuplas.resumo.confrontosConcluidos} concluído(s)
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Últimos 5</div>
                        {renderUltimos5(data.confrontoDuplas.resumo.ultimos5, data.partida.duplaA.nome, data.partida.duplaB.nome)}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                        <UserRound className="h-4 w-4" />
                        Variações entre atletas
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {data.confrontosIndividuais.map((item) => (
                          <div key={item.chave} className="rounded-xl bg-white p-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {item.atletaA.nome} x {item.atletaB.nome}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                                {item.resumo.vitoriasAtletaA} x {item.resumo.vitoriasAtletaB}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                                {item.resumo.confrontos} confronto(s)
                              </span>
                            </div>
                            <div className="mt-3">
                              {renderUltimos5(item.resumo.ultimos5, item.atletaA.nome, item.atletaB.nome)}
                            </div>
                            <div className="mt-3 space-y-2 text-xs text-slate-600">
                              <div>
                                Parceiros de {item.atletaA.nome}:{" "}
                                <span className="font-medium">{item.resumo.parceirosAtletaA.length ? item.resumo.parceirosAtletaA.join(", ") : "sem variações"}</span>
                              </div>
                              <div>
                                Parceiros de {item.atletaB.nome}:{" "}
                                <span className="font-medium">{item.resumo.parceirosAtletaB.length ? item.resumo.parceirosAtletaB.join(", ") : "sem variações"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className="space-y-3">
                    <div className="text-sm font-bold text-slate-900">Histórico da dupla atual</div>
                    {data.confrontoDuplas.historico.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        Essa combinação de dupla ainda não se enfrentou em partidas concluídas.
                      </div>
                    ) : (
                      data.confrontoDuplas.historico.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {item.duplaA.nome} x {item.duplaB.nome}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.torneio.nome} • {item.categoria.nome} • {item.faseLabel} • {formatDataHora(item.dataReferencia)}
                              </div>
                              <div className="mt-2 text-sm text-slate-700">
                                {nomesAtletas(item.duplaA)} <span className="text-slate-400">vs</span> {nomesAtletas(item.duplaB)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-slate-900">
                                {item.placar.a ?? "-"} x {item.placar.b ?? "-"}
                              </div>
                              <div className="text-xs text-slate-500">{formatPlacar(item.placar.detalhes)}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="text-sm font-bold text-slate-900">Confrontos individuais</div>
                    <div className="space-y-4">
                      {data.confrontosIndividuais.map((item) => (
                        <div key={item.chave} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {item.atletaA.nome} x {item.atletaB.nome}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.resumo.confrontos} confronto(s) • {item.resumo.vitoriasAtletaA} vitória(s) de {item.atletaA.nome} • {item.resumo.vitoriasAtletaB} vitória(s) de {item.atletaB.nome}
                              </div>
                            </div>
                            <div>{renderUltimos5(item.resumo.ultimos5, item.atletaA.nome, item.atletaB.nome)}</div>
                          </div>

                          {item.historico.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                              Sem histórico concluído para essa combinação individual.
                            </div>
                          ) : (
                            <div className="mt-3 space-y-3">
                              {item.historico.map((hist) => (
                                <div key={hist.id} className="rounded-xl bg-slate-50 p-3">
                                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <div className="text-sm font-medium text-slate-900">
                                        {item.atletaA.nome}
                                        {hist.atletaAParceiro ? ` / ${hist.atletaAParceiro.nome}` : ""}{" "}
                                        <span className="text-slate-400">vs</span> {item.atletaB.nome}
                                        {hist.atletaBParceiro ? ` / ${hist.atletaBParceiro.nome}` : ""}
                                      </div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        {hist.torneio.nome} • {hist.categoria.nome} • {hist.faseLabel} • {formatDataHora(hist.dataReferencia)}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-sm font-bold text-slate-900">
                                        {hist.placar.a ?? "-"} x {hist.placar.b ?? "-"}
                                      </div>
                                      <div className="text-xs text-slate-500">{formatPlacar(hist.placar.detalhes)}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
