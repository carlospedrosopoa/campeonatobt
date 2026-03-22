"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, MapPin, Trophy, Users, ChevronLeft, Camera, Video } from "lucide-react";
import Link from "next/link";

type Categoria = {
  id: string;
  nome: string;
  genero: string;
  valorInscricao: string | null;
  vagasMaximas: number | null;
};

type Torneio = {
  id: string;
  nome: string;
  slug: string;
  status: string;
  bannerUrl: string | null;
  esporteNome: string | null;
};

type Inscrito = {
  id: string;
  status: string;
  equipe: {
    nome: string | null;
    atletas: { id: string; nome: string; email: string; fotoUrl?: string | null }[];
  };
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
    saldoGames: number;
    gamesPro: number;
    gamesContra: number;
    setsPro: number;
  }[];
};

type Partida = {
  id: string;
  fase: string;
  status: string;
  rodadaNome: string | null;
  rodadaNumero: number | null;
  rodadaDataLimite: string | null;
  equipeAId: string | null;
  equipeBId: string | null;
  equipeANome: string | null;
  equipeBNome: string | null;
  vencedorId: string | null;
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: any;
  dataHorario: string | null;
  quadra: string | null;
  fotoUrl: string | null;
  transmissaoUrl: string | null;
  equipeAAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
  equipeBAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
};

interface Props {
  torneio: Torneio;
  categoria: Categoria;
}

export default function CategoriaDetalhesContent({ torneio, categoria }: Props) {
  const ordemFases = ["GRUPOS", "OITAVAS", "QUARTAS", "SEMI", "FINAL"] as const;
  const [tab, setTab] = useState<"inscritos" | "classificacao" | "jogos">("inscritos");
  const [fase, setFase] = useState("GRUPOS");
  
  const [inscritos, setInscritos] = useState<Inscrito[]>([]);
  const [classificacao, setClassificacao] = useState<ClassificacaoGrupo[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [fasesDisponiveis, setFasesDisponiveis] = useState<string[]>(["GRUPOS"]);
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === "inscritos") {
      carregarInscritos();
    } else if (tab === "classificacao") {
      carregarClassificacao();
    } else if (tab === "jogos") {
      carregarPartidas();
    }
  }, [tab, fase]);

  async function carregarInscritos() {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/torneios/${torneio.slug}/categorias/${categoria.id}/inscritos`);
      const data = await res.json();
      setInscritos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function carregarClassificacao() {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/torneios/${torneio.slug}/categorias/${categoria.id}/classificacao`);
      const data = await res.json();
      setClassificacao(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function carregarPartidas() {
    setLoading(true);
    try {
      const [resFase, resAll] = await Promise.all([
        fetch(`/api/public/torneios/${torneio.slug}/categorias/${categoria.id}/partidas?fase=${fase}`),
        fetch(`/api/public/torneios/${torneio.slug}/categorias/${categoria.id}/partidas`),
      ]);
      const dataFase = await resFase.json();
      const dataAll = await resAll.json();
      const listaFase = Array.isArray(dataFase) ? dataFase : [];
      const listaAll = Array.isArray(dataAll) ? dataAll : [];
      setPartidas(listaFase);
      const fasesSet = new Set<string>(listaAll.map((p: Partida) => p.fase).filter(Boolean));
      const fases = ordemFases.filter((f) => fasesSet.has(f));
      setFasesDisponiveis(fases.length > 0 ? [...fases] : ["GRUPOS"]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== "jogos") return;
    if (fasesDisponiveis.includes(fase)) return;
    setFase(fasesDisponiveis[0] || "GRUPOS");
  }, [tab, fase, fasesDisponiveis]);

  function formatarPlacar(p: Partida) {
    if (!p.detalhesPlacar || !Array.isArray(p.detalhesPlacar)) {
      return (
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-500">Sets</span>
          <span className="font-bold text-gray-900">{p.placarA} x {p.placarB}</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 text-sm font-mono">
        {p.detalhesPlacar.map((s: any, i: number) => (
          <div key={i} className="flex flex-col items-center bg-gray-50 px-2 py-1 rounded">
            <span className="text-gray-900 font-bold">{s.a}-{s.b}</span>
            {s.tiebreak && <span className="text-[10px] text-gray-500">({s.tbA}-{s.tbB})</span>}
          </div>
        ))}
      </div>
    );
  }

  const partidasPorRodada = useMemo(() => {
    const grupos = new Map<number, { nome: string; dataLimite: string | null; jogos: Partida[] }>();

    partidas.forEach((p) => {
      const num = p.rodadaNumero ?? 0;
      const atual = grupos.get(num) ?? {
        nome: p.rodadaNome || `Rodada ${num}`,
        dataLimite: p.rodadaDataLimite || p.dataLimite,
        jogos: [],
      };
      if (!atual.dataLimite && (p.rodadaDataLimite || p.dataLimite)) {
        atual.dataLimite = p.rodadaDataLimite || p.dataLimite;
      }
      atual.jogos.push(p);
      grupos.set(num, atual);
    });

    return Array.from(grupos.entries()).sort((a, b) => a[0] - b[0]);
  }, [partidas]);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <nav className="flex gap-2 overflow-x-auto" aria-label="Tabs">
          {(["inscritos", "classificacao", "jogos"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors
                ${tab === t
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }
              `}
            >
              {t === "inscritos" && "Inscritos"}
              {t === "classificacao" && "Classificação"}
              {t === "jogos" && "Jogos"}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Carregando...</div>
      ) : (
        <>
          {/* Aba Inscritos */}
          {tab === "inscritos" && (
            <div className="">
              {inscritos.length === 0 ? (
                <div className="p-8 text-center text-gray-500">Nenhum inscrito ainda.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inscritos.map((i, idx) => (
                    <div key={i.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-mono text-gray-400">#{idx + 1}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                          i.status === "APROVADA" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {i.status}
                        </span>
                      </div>
                      <div className="font-bold text-gray-900 truncate mb-1" title={i.equipe.nome || "Dupla"}>
                        {i.equipe.nome || "Dupla"}
                      </div>
                      <div className="space-y-3 mt-3">
                        {i.equipe.atletas.map(a => (
                          <div key={a.id} className="flex items-center gap-3">
                            <img
                              src={a.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=random&color=fff`}
                              alt={a.nome}
                              className="w-8 h-8 rounded-full object-cover bg-gray-100 ring-1 ring-gray-200"
                            />
                            <div className="text-sm font-medium text-gray-700 truncate">{a.nome}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aba Classificação */}
          {tab === "classificacao" && (
            <div className="space-y-6">
              {classificacao.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
                  Classificação não disponível.
                </div>
              ) : (
                classificacao.map((grupo) => (
                  <div key={grupo.grupoId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <div className="font-bold text-slate-800">{grupo.grupoNome}</div>
                      <div className="text-xs font-medium text-slate-500">{grupo.equipes.length} duplas</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium w-full">Equipe</th>
                            <th className="px-2 py-3 text-center font-medium" title="Pontos">P</th>
                            <th className="px-2 py-3 text-center font-medium" title="Jogos">J</th>
                            <th className="px-2 py-3 text-center font-medium" title="Vitórias">V</th>
                            <th className="px-2 py-3 text-center font-medium" title="Saldo de Games">SG</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grupo.equipes.map((e, idx) => (
                            <tr key={e.equipeId} className="hover:bg-slate-50/70">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${idx < 2 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                    {idx + 1}
                                  </span>
                                  <span className="font-medium text-slate-900">{e.equipeNome}</span>
                                </div>
                              </td>
                              <td className="px-2 py-3 text-center font-bold text-slate-900">{e.pontos}</td>
                              <td className="px-2 py-3 text-center text-slate-600">{e.jogosJogados}</td>
                              <td className="px-2 py-3 text-center text-slate-600">{e.jogosVencidos}</td>
                              <td className="px-2 py-3 text-center text-slate-600">{e.saldoGames}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Aba Jogos */}
          {tab === "jogos" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                <div className="flex items-center gap-2 overflow-x-auto">
                {fasesDisponiveis.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFase(f)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                      fase === f ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {f}
                  </button>
                ))}
                </div>
              </div>

              {partidas.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
                  Nenhum jogo encontrado nesta fase.
                </div>
              ) : (
                <div className="space-y-8">
                  {partidasPorRodada.map(([num, dados]) => (
                    <div key={num} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                        <span className="font-bold text-slate-800">{dados.nome}</span>
                        {dados.dataLimite && (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            Limite: {new Date(dados.dataLimite).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-gray-100">
                        {dados.jogos.map((p) => (
                          <div key={p.id} className="p-4 md:p-5 hover:bg-slate-50/70 transition-colors">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                              <div className="md:w-36 shrink-0 flex flex-col text-sm text-slate-500">
                                {p.dataHorario ? (
                                  <>
                                    <span className="font-semibold text-slate-900">
                                      {new Date(p.dataHorario).toLocaleDateString("pt-BR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                      })}
                                    </span>
                                    <span className="text-xs">
                                      {new Date(p.dataHorario).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs italic text-slate-400">Não agendado</span>
                                )}
                                {p.quadra && (
                                  <span className="mt-1 inline-flex items-center gap-1 text-xs">
                                    <MapPin className="w-3 h-3" />
                                    {p.quadra}
                                  </span>
                                )}
                              </div>

                              <div className="flex-1 flex items-center justify-between gap-4">
                                <div className={`flex-1 text-right ${p.vencedorId && p.vencedorId === p.equipeAId ? "text-green-700" : "text-slate-900"}`}>
                                  <div className="font-semibold">{p.equipeANome || "A definir"}</div>
                                  <div className="mt-2 flex items-center justify-end -space-x-2">
                                    {(p.equipeAAtletas || []).slice(0, 2).map((a) => (
                                      <img
                                        key={a.id}
                                        src={a.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=random&color=fff`}
                                        alt={a.nome}
                                        title={a.nome}
                                        className="h-7 w-7 rounded-full ring-2 ring-white object-cover bg-slate-100"
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="shrink-0 flex flex-col items-center min-w-[96px]">
                                  {p.status === "FINALIZADA" || p.status === "WO" ? (
                                    formatarPlacar(p)
                                  ) : (
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">vs</span>
                                  )}
                                </div>

                                <div className={`flex-1 text-left ${p.vencedorId && p.vencedorId === p.equipeBId ? "text-green-700" : "text-slate-900"}`}>
                                  <div className="font-semibold">{p.equipeBNome || "A definir"}</div>
                                  <div className="mt-2 flex items-center -space-x-2">
                                    {(p.equipeBAtletas || []).slice(0, 2).map((a) => (
                                      <img
                                        key={a.id}
                                        src={a.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=random&color=fff`}
                                        alt={a.nome}
                                        title={a.nome}
                                        className="h-7 w-7 rounded-full ring-2 ring-white object-cover bg-slate-100"
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {(p.fotoUrl || p.transmissaoUrl) && (
                                <div className="flex items-center gap-2 md:ml-4 border-t md:border-t-0 md:border-l border-gray-100 pt-2 md:pt-0 md:pl-4 justify-center md:justify-start">
                                  {p.fotoUrl && (
                                    <a 
                                      href={p.fotoUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                      title="Ver fotos"
                                    >
                                      <Camera className="w-4 h-4" />
                                    </a>
                                  )}
                                  {p.transmissaoUrl && (
                                    <a 
                                      href={p.transmissaoUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                      title="Assistir transmissão"
                                    >
                                      <Video className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
