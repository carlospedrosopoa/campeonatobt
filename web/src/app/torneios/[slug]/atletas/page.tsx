"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, Calendar, MapPin, User } from "lucide-react";

type AtletaOption = { id: string; nome: string; fotoUrl: string | null };

type Partida = {
  id: string;
  categoriaId: string;
  categoriaNome: string;
  fase: string;
  status: string;
  rodadaId: string | null;
  rodadaNome: string | null;
  rodadaNumero: number | null;
  grupoId: string | null;
  grupoNome: string | null;
  arenaId: string | null;
  arenaNome: string | null;
  arenaLogoUrl: string | null;
  equipeAId: string;
  equipeANome: string | null;
  equipeAAtletas: { id: string; nome: string; fotoUrl: string | null }[];
  equipeBId: string;
  equipeBNome: string | null;
  equipeBAtletas: { id: string; nome: string; fotoUrl: string | null }[];
  vencedorId: string | null;
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  dataHorario: string | null;
  dataLimite: string | null;
  quadra: string | null;
  fotoUrl: string | null;
  transmissaoUrl: string | null;
  meuTimeId: string;
  criadoEm: string;
};

type Dashboard = {
  torneio: { id: string; nome: string; slug: string };
  atleta: { id: string; nome: string; fotoUrl: string | null };
  partidas: Partida[];
};

type ClassificacaoGrupo = {
  grupoId: string;
  grupoNome: string;
  equipes: {
    equipeId: string;
    equipeNome: string;
    pontos: number;
    jogosJogados: number;
    jogosVencidos: number;
    jogosPerdidos: number;
    setsPro?: number;
    saldoGames: number;
  }[];
};

function formatDataHora(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatPlacar(detalhes: Partida["detalhesPlacar"]) {
  if (!detalhes || detalhes.length === 0) return "-";
  return detalhes
    .slice()
    .sort((a, b) => a.set - b.set)
    .map((s) => {
      if (s.tiebreak && s.tbA !== undefined && s.tbB !== undefined) return `${s.a}-${s.b} (${s.tbA}-${s.tbB})`;
      return `${s.a}-${s.b}`;
    })
    .join(" ");
}

function BarList({ items }: { items: Array<{ label: string; value: number }> }) {
  const total = items.reduce((acc, i) => acc + i.value, 0);
  if (items.length === 0) return <div className="text-sm text-slate-500">Sem dados.</div>;

  return (
    <div className="space-y-2">
      {items.map((i) => {
        const pct = total > 0 ? Math.round((i.value / total) * 100) : 0;
        return (
          <div key={i.label} className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-700 truncate">{i.label}</div>
                <div className="text-xs font-bold text-slate-500 shrink-0">{i.value}</div>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-slate-900" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="text-xs font-bold text-slate-500 w-10 text-right">{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

export default function TorneioAtletasDashboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [atletas, setAtletas] = useState<AtletaOption[]>([]);
  const [carregandoAtletas, setCarregandoAtletas] = useState(true);

  const [busca, setBusca] = useState("");
  const [atletaId, setAtletaId] = useState("");

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [carregandoDashboard, setCarregandoDashboard] = useState(false);
  const [carregandoClassificacao, setCarregandoClassificacao] = useState(false);
  const [classificacaoPorCategoria, setClassificacaoPorCategoria] = useState<Record<string, ClassificacaoGrupo[]>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setErro(null);
        setCarregandoAtletas(true);
        const res = await fetch(`/api/public/torneios/${slug}/atletas`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(payload?.error || "Falha ao carregar atletas");
        const list = (Array.isArray(payload) ? payload : []) as AtletaOption[];
        if (!ativo) return;
        setAtletas(list);
      } catch (e: any) {
        if (!ativo) return;
        setErro(e?.message || "Erro inesperado");
      } finally {
        if (!ativo) return;
        setCarregandoAtletas(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [slug]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!atletaId) {
        setDashboard(null);
        setClassificacaoPorCategoria({});
        return;
      }
      try {
        setErro(null);
        setCarregandoDashboard(true);
        const res = await fetch(`/api/public/torneios/${slug}/atletas/${atletaId}/dashboard`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(payload?.error || "Falha ao carregar dashboard");
        if (!ativo) return;
        setDashboard(payload as Dashboard);
      } catch (e: any) {
        if (!ativo) return;
        setErro(e?.message || "Erro inesperado");
      } finally {
        if (!ativo) return;
        setCarregandoDashboard(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [slug, atletaId]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!dashboard || !atletaId) {
        setClassificacaoPorCategoria({});
        return;
      }
      try {
        setCarregandoClassificacao(true);
        const categoriaIds = Array.from(new Set((dashboard.partidas ?? []).map((p) => p.categoriaId).filter(Boolean)));
        if (categoriaIds.length === 0) {
          setClassificacaoPorCategoria({});
          return;
        }

        const results = await Promise.all(
          categoriaIds.map(async (categoriaId) => {
            const res = await fetch(`/api/public/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
            const payload = (await res.json().catch(() => null)) as any;
            if (!res.ok) return [categoriaId, [] as ClassificacaoGrupo[]] as const;
            const groups = (Array.isArray(payload) ? payload : []) as ClassificacaoGrupo[];
            return [categoriaId, groups] as const;
          })
        );

        if (!ativo) return;
        const map: Record<string, ClassificacaoGrupo[]> = {};
        for (const [categoriaId, grupos] of results) map[categoriaId] = grupos;
        setClassificacaoPorCategoria(map);
      } finally {
        if (!ativo) return;
        setCarregandoClassificacao(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [slug, atletaId, dashboard]);

  const atletasFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return atletas;
    return atletas.filter((a) => a.nome.toLowerCase().includes(q));
  }, [atletas, busca]);

  const categoriasDoAtleta = useMemo(() => {
    const list = dashboard?.partidas ?? [];
    const map = new Map<string, string>();
    for (const p of list) {
      if (!p.categoriaId) continue;
      map.set(p.categoriaId, p.categoriaNome || "Categoria");
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dashboard]);

  const equipesDoAtleta = useMemo(() => {
    const list = dashboard?.partidas ?? [];
    return new Set(list.map((p) => p.meuTimeId).filter(Boolean));
  }, [dashboard]);

  const partidasOrdenadas = useMemo(() => {
    const list = dashboard?.partidas ?? [];
    return list.slice().sort((a, b) => {
      const da = a.dataHorario ? new Date(a.dataHorario).getTime() : new Date(a.criadoEm).getTime();
      const db = b.dataHorario ? new Date(b.dataHorario).getTime() : new Date(b.criadoEm).getTime();
      return db - da;
    });
  }, [dashboard]);

  const stats = useMemo(() => {
    const partidas = dashboard?.partidas ?? [];
    const finalizadas = partidas.filter((p) => p.status === "FINALIZADA" || p.status === "WO");
    const vitorias = finalizadas.filter((p) => p.vencedorId && p.vencedorId === p.meuTimeId).length;
    const derrotas = finalizadas.filter((p) => p.vencedorId && p.vencedorId !== p.meuTimeId).length;
    const wo = finalizadas.filter((p) => p.status === "WO").length;
    const winPct = finalizadas.length > 0 ? Math.round((vitorias / finalizadas.length) * 100) : 0;

    const byArena = new Map<string, number>();
    const byWeekday = new Map<string, number>();
    const byTurno = new Map<string, number>();

    const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

    for (const p of partidas) {
      const arena = (p.arenaNome || "Não agendados").trim();
      byArena.set(arena, (byArena.get(arena) ?? 0) + 1);

      if (p.dataHorario) {
        const d = new Date(p.dataHorario);
        if (!Number.isNaN(d.getTime())) {
          const dia = dias[d.getDay()] ?? "Dia";
          byWeekday.set(dia, (byWeekday.get(dia) ?? 0) + 1);
          const h = d.getHours();
          const turno = h >= 5 && h <= 11 ? "Manhã" : h >= 12 && h <= 17 ? "Tarde" : h >= 18 && h <= 22 ? "Noite" : "Madrugada";
          byTurno.set(turno, (byTurno.get(turno) ?? 0) + 1);
        }
      }
    }

    const toSorted = (m: Map<string, number>) => Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    return {
      total: partidas.length,
      finalizadas: finalizadas.length,
      vitorias,
      derrotas,
      wo,
      winPct,
      arenas: toSorted(byArena),
      diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map((label) => ({ label, value: byWeekday.get(label) ?? 0 })).filter((i) => i.value > 0),
      turnos: ["Manhã", "Tarde", "Noite", "Madrugada"].map((label) => ({ label, value: byTurno.get(label) ?? 0 })).filter((i) => i.value > 0),
    };
  }, [dashboard]);

  const atletaSelecionado = useMemo(() => atletas.find((a) => a.id === atletaId) ?? null, [atletas, atletaId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao torneio
            </Link>
            <h1 className="mt-2 text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-orange-500" />
              Dashboard do Atleta
            </h1>
            <p className="text-sm text-slate-600">Selecione um atleta da competição para ver jogos, resultados e desempenho.</p>
          </div>
        </div>

        {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Buscar atleta</label>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Digite o nome…"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Atleta</label>
              <select
                value={atletaId}
                onChange={(e) => setAtletaId(e.target.value)}
                disabled={carregandoAtletas}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-50"
              >
                <option value="">{carregandoAtletas ? "Carregando…" : "Selecione um atleta"}</option>
                {atletasFiltrados.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {atletaSelecionado ? (
            <div className="mt-5 flex items-center gap-3">
              {atletaSelecionado.fotoUrl ? (
                <img src={atletaSelecionado.fotoUrl} alt={atletaSelecionado.nome} className="h-10 w-10 rounded-full object-cover bg-slate-100 ring-1 ring-slate-200" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center text-slate-400">
                  <User className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{atletaSelecionado.nome}</div>
                <div className="text-xs text-slate-500">Jogos no torneio: {stats.total}</div>
              </div>
            </div>
          ) : null}
        </div>

        {carregandoDashboard ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-sm text-slate-600">Carregando dashboard…</div>
        ) : dashboard && atletaId ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs text-slate-500 uppercase tracking-wider">Finalizadas</div>
                <div className="text-2xl font-black text-slate-900">{stats.finalizadas}</div>
                <div className="text-xs text-slate-500 mt-1">de {stats.total} jogos</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs text-slate-500 uppercase tracking-wider">Vitórias</div>
                <div className="text-2xl font-black text-green-700">{stats.vitorias}</div>
                <div className="text-xs text-slate-500 mt-1">Winrate: {stats.winPct}%</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs text-slate-500 uppercase tracking-wider">Derrotas</div>
                <div className="text-2xl font-black text-red-700">{stats.derrotas}</div>
                <div className="text-xs text-slate-500 mt-1">WO: {stats.wo}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs text-slate-500 uppercase tracking-wider">Atleta</div>
                <div className="text-lg font-black text-slate-900 truncate">{dashboard.atleta.nome}</div>
                <div className="text-xs text-slate-500 mt-1">{dashboard.torneio.nome}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-4 w-4 text-orange-500" />
                  <div className="font-bold text-slate-900">Arenas</div>
                </div>
                <BarList items={stats.arenas} />
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-4 w-4 text-orange-500" />
                  <div className="font-bold text-slate-900">Dias da semana</div>
                </div>
                <BarList items={stats.diasSemana} />
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4 text-orange-500" />
                  <div className="font-bold text-slate-900">Turnos</div>
                </div>
                <BarList items={stats.turnos} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-bold text-slate-900">Classificação</div>
                  <div className="text-sm text-slate-600">Tabela de classificação da(s) categoria(s) do atleta.</div>
                </div>
              </div>

              {carregandoClassificacao ? (
                <div className="mt-4 text-sm text-slate-600">Carregando classificação…</div>
              ) : categoriasDoAtleta.length === 0 ? (
                <div className="mt-4 text-sm text-slate-600">Sem categorias para exibir.</div>
              ) : (
                <div className="mt-4 space-y-6">
                  {categoriasDoAtleta.map((cat) => {
                    const grupos = classificacaoPorCategoria[cat.id] ?? [];
                    return (
                      <div key={cat.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-slate-900">{cat.nome}</div>
                          <div className="text-xs text-slate-500 font-semibold">{grupos.length ? `${grupos.length} grupo(s)` : "Sem classificação"}</div>
                        </div>

                        {grupos.length === 0 ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            Classificação não disponível.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {grupos.map((grupo) => (
                              <div key={grupo.grupoId} className="rounded-xl border border-slate-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                  <div className="font-bold text-slate-800">{grupo.grupoNome}</div>
                                  <div className="text-xs font-medium text-slate-500">{grupo.equipes.length} duplas</div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                      <tr>
                                        <th className="px-4 py-3 text-left font-medium w-full">Equipe</th>
                                        <th className="px-2 py-3 text-center font-medium" title="Pontos">
                                          P
                                        </th>
                                        <th className="px-2 py-3 text-center font-medium" title="Jogos">
                                          J
                                        </th>
                                        <th className="px-2 py-3 text-center font-medium" title="Vitórias">
                                          V
                                        </th>
                                        <th className="px-2 py-3 text-center font-medium" title="Sets Pró">
                                          SP
                                        </th>
                                        <th className="px-2 py-3 text-center font-medium" title="Saldo de Games">
                                          SG
                                        </th>
                                        <th className="px-2 py-3 text-center font-medium" title="Aproveitamento">
                                          AP%
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {grupo.equipes.map((e, idx) => {
                                        const isMine = equipesDoAtleta.has(e.equipeId);
                                        return (
                                          <tr key={e.equipeId} className={`hover:bg-slate-50/70 ${isMine ? "bg-amber-50/70" : ""}`}>
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-2">
                                                <span
                                                  className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${
                                                    isMine ? "bg-amber-200 text-amber-900" : idx < 2 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                                                  }`}
                                                >
                                                  {idx + 1}
                                                </span>
                                                <span className={`font-medium ${isMine ? "text-amber-950" : "text-slate-900"}`}>{e.equipeNome}</span>
                                                {isMine ? (
                                                  <span className="ml-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
                                                    Atleta
                                                  </span>
                                                ) : null}
                                              </div>
                                            </td>
                                            <td className={`px-2 py-3 text-center font-bold ${isMine ? "text-amber-950" : "text-slate-900"}`}>{e.pontos}</td>
                                            <td className="px-2 py-3 text-center text-slate-600">{e.jogosJogados}</td>
                                            <td className="px-2 py-3 text-center text-slate-600">{e.jogosVencidos}</td>
                                            <td className="px-2 py-3 text-center text-slate-600">{e.setsPro ?? 0}</td>
                                            <td className="px-2 py-3 text-center text-slate-600">{e.saldoGames}</td>
                                            <td className="px-2 py-3 text-center text-slate-600">
                                              {e.jogosJogados > 0 ? `${Math.round((e.pontos / (e.jogosJogados * 3)) * 100)}%` : "0%"}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-bold text-slate-900">Jogos</div>
                  <div className="text-sm text-slate-600">Lista de partidas (mais recentes primeiro).</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {partidasOrdenadas.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-slate-500">Nenhuma partida encontrada.</div>
                ) : (
                  partidasOrdenadas.map((p) => {
                    const meuLado = p.meuTimeId === p.equipeAId ? "A" : "B";
                    const adversario = meuLado === "A" ? p.equipeBNome || p.equipeBId.slice(0, 8) : p.equipeANome || p.equipeAId.slice(0, 8);
                    const ganhou = (p.status === "FINALIZADA" || p.status === "WO") && p.vencedorId === p.meuTimeId;
                    const perdeu = (p.status === "FINALIZADA" || p.status === "WO") && p.vencedorId && p.vencedorId !== p.meuTimeId;
                    const statusLabel = ganhou ? "Vitória" : perdeu ? "Derrota" : p.status;
                    const statusClass = ganhou
                      ? "bg-green-50 text-green-700 border-green-100"
                      : perdeu
                        ? "bg-red-50 text-red-700 border-red-100"
                        : "bg-slate-50 text-slate-600 border-slate-100";

                    return (
                      <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500 font-semibold">{formatDataHora(p.dataHorario)}</div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusClass}`}>{statusLabel}</span>
                        </div>

                        <div className="mt-3">
                          <div className="text-sm font-black text-slate-900">{dashboard.atleta.nome}</div>
                          <div className="text-sm text-slate-600">
                            vs <span className="font-semibold text-slate-800">{adversario}</span>
                          </div>
                          <div className="mt-2 text-sm font-mono font-bold text-slate-900">{formatPlacar(p.detalhesPlacar)}</div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-500">Categoria</span>
                            <span className="truncate">{p.categoriaNome}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-500">Fase</span>
                            <span>{p.fase}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-500">Rodada</span>
                            <span className="truncate">{p.rodadaNome || (p.rodadaNumero ? `Rodada ${p.rodadaNumero}` : "-")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-500">Local</span>
                            <span className="truncate">{[p.arenaNome || "Não agendado", p.quadra ? `Q. ${p.quadra}` : ""].filter(Boolean).join(" • ")}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-sm text-slate-600">
            Selecione um atleta para ver o dashboard.
          </div>
        )}
      </div>
    </div>
  );
}
