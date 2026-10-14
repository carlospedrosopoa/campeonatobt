"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, MapPin, Trophy, Users, ChevronLeft, Camera, ImageIcon, Video } from "lucide-react";
import Link from "next/link";
import { gerarCardPartidaAdmin } from "@/lib/match-card-client";

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
  templateUrl?: string | null;
  layoutCards?: string | null;
  esporteNome: string | null;
  superCampeonato?: boolean;
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
  dataLimite?: string | null;
  equipeAId: string | null;
  equipeBId: string | null;
  equipeANome: string | null;
  equipeBNome: string | null;
  vencedorId: string | null;
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: any;
  dataHorario: string | null;
  arenaNome?: string | null;
  arenaLogoUrl?: string | null;
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

function formatarDataSemFuso(data: string | null | undefined) {
  if (!data) return "";
  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const NOME_FASE: Record<string, string> = {
  GRUPOS: "Fase de grupos",
  OITAVAS: "Oitavas",
  QUARTAS: "Quartas",
  SEMI: "Semifinal",
  FINAL: "Final",
};

const fusoBR = { timeZone: "America/Sao_Paulo" } as const;

function jogoEncerrado(p: Partida) {
  return p.status === "FINALIZADA" || p.status === "WO";
}

/** Prazo da rodada: encerrada, vencida, vencendo (ate 3 dias) ou normal. */
function situacaoPrazo(dataLimite: string | null, rodadaEncerrada: boolean) {
  if (rodadaEncerrada) return { rotulo: "Encerrada · prazo", classe: "bg-emerald-50 text-emerald-700" };
  const ymd = dataLimite?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!ymd) return { rotulo: "Prazo", classe: "bg-slate-100 text-slate-600" };
  const limite = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 23, 59);
  const dias = (limite.getTime() - Date.now()) / 86_400_000;
  if (dias < 0) return { rotulo: "Prazo vencido", classe: "bg-rose-50 text-rose-700" };
  if (dias <= 3) return { rotulo: "Prazo até", classe: "bg-amber-50 text-amber-800" };
  return { rotulo: "Prazo até", classe: "bg-slate-100 text-slate-600" };
}

function nomeCurto(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return p.length <= 1 ? p[0] ?? "" : `${p[0]} ${p[p.length - 1]}`;
}

function avatarUrl(a: { nome: string; fotoUrl?: string | null }) {
  return a.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=random&color=fff`;
}

/** Linha de uma dupla no placar: fotos, nome e games de cada set. */
function LinhaDupla({
  nome,
  atletas,
  vencedora,
  encerrado,
  sets,
  placar,
}: {
  nome: string;
  atletas: { id: string; nome: string; fotoUrl?: string | null }[];
  vencedora: boolean;
  encerrado: boolean;
  sets: { games: number; venceuSet: boolean; tiebreak?: number | null }[];
  placar: number | null;
}) {
  return (
    <div className={`flex items-center gap-3 py-2 ${encerrado && !vencedora ? "opacity-60" : ""}`}>
      <div className="flex shrink-0 -space-x-2">
        {atletas.slice(0, 2).map((a) => (
          <img key={a.id} src={avatarUrl(a)} alt={a.nome} title={a.nome} className="h-9 w-9 rounded-full bg-slate-100 object-cover ring-2 ring-white" />
        ))}
        {atletas.length === 0 && <div className="h-9 w-9 rounded-full bg-slate-100 ring-2 ring-white" />}
      </div>
      {/* um atleta por linha (primeiro e ultimo nome) para caber no celular */}
      <div className={`min-w-0 flex-1 text-sm leading-tight ${vencedora ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}>
        {atletas.length > 0 ? (
          atletas.slice(0, 2).map((a) => (
            <div key={a.id} className="truncate">
              {nomeCurto(a.nome)}
            </div>
          ))
        ) : (
          <div className="truncate">{nome}</div>
        )}
      </div>
      {vencedora && <Trophy className="h-4 w-4 shrink-0 text-amber-500" />}
      {encerrado && (
        <div className="flex shrink-0 items-center gap-1">
          {sets.length > 0
            ? sets.map((s, i) => (
                <span
                  key={i}
                  className={`relative inline-flex h-8 w-7 items-center justify-center rounded-md text-sm tabular-nums ${
                    s.venceuSet ? "bg-slate-900 font-bold text-white" : "bg-slate-100 font-semibold text-slate-500"
                  }`}
                >
                  {s.games}
                  {s.tiebreak != null && <sup className="absolute -right-0.5 -top-1 text-[9px] font-bold text-slate-400">{s.tiebreak}</sup>}
                </span>
              ))
            : (
                <span className={`inline-flex h-8 min-w-7 items-center justify-center rounded-md px-1.5 text-sm tabular-nums ${vencedora ? "bg-slate-900 font-bold text-white" : "bg-slate-100 font-semibold text-slate-500"}`}>
                  {placar ?? 0}
                </span>
              )}
        </div>
      )}
    </div>
  );
}

function JogoPublico({ partida: p, numero, onCard }: { partida: Partida; numero: number; onCard: () => void }) {
  const encerrado = jogoEncerrado(p);
  const sets = Array.isArray(p.detalhesPlacar) ? (p.detalhesPlacar as { a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[]) : [];
  const setsA = sets.map((s) => ({ games: s.a, venceuSet: s.a > s.b, tiebreak: s.tiebreak ? s.tbA ?? null : null }));
  const setsB = sets.map((s) => ({ games: s.b, venceuSet: s.b > s.a, tiebreak: s.tiebreak ? s.tbB ?? null : null }));

  const quando = p.dataHorario
    ? `${new Date(p.dataHorario).toLocaleDateString("pt-BR", { ...fusoBR, weekday: "short", day: "2-digit", month: "2-digit" })} · ${new Date(
        p.dataHorario
      ).toLocaleTimeString("pt-BR", { ...fusoBR, hour: "2-digit", minute: "2-digit" })}`
    : null;
  const situacao = p.status === "WO"
    ? { rotulo: "W.O.", classe: "bg-rose-50 text-rose-700" }
    : encerrado
      ? { rotulo: "Encerrado", classe: "bg-emerald-50 text-emerald-700" }
      : p.status === "EM_ANDAMENTO"
        ? { rotulo: "Em quadra", classe: "bg-sky-50 text-sky-700" }
        : quando
          ? { rotulo: "Agendado", classe: "bg-indigo-50 text-indigo-700" }
          : { rotulo: "A agendar", classe: "bg-amber-50 text-amber-800" };

  return (
    <article className="rounded-xl border border-slate-200 bg-white px-4 pb-2 pt-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-bold ${situacao.classe}`}>{situacao.rotulo}</span>
        <span className="font-semibold text-slate-400">Jogo {numero}</span>
        {quando && (
          <span className="inline-flex items-center gap-1 font-semibold capitalize text-slate-700">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            {quando}
          </span>
        )}
        {(p.arenaNome || p.quadra) && (
          <span className="inline-flex min-w-0 items-center gap-1 text-slate-500">
            {p.arenaLogoUrl ? <img src={p.arenaLogoUrl} alt="" className="h-4 w-4 rounded-full object-cover" /> : <MapPin className="h-3.5 w-3.5" />}
            <span className="truncate">
              {p.arenaNome || "Arena"}
              {p.quadra ? ` · ${p.quadra}` : ""}
            </span>
          </span>
        )}
      </div>

      <div className="mt-1 divide-y divide-slate-100">
        <LinhaDupla
          nome={p.equipeANome || "A definir"}
          atletas={p.equipeAAtletas ?? []}
          vencedora={Boolean(p.vencedorId && p.vencedorId === p.equipeAId)}
          encerrado={encerrado}
          sets={setsA}
          placar={p.placarA}
        />
        <LinhaDupla
          nome={p.equipeBNome || "A definir"}
          atletas={p.equipeBAtletas ?? []}
          vencedora={Boolean(p.vencedorId && p.vencedorId === p.equipeBId)}
          encerrado={encerrado}
          sets={setsB}
          placar={p.placarB}
        />
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
        {p.fotoUrl && (
          <a href={p.fotoUrl} target="_blank" rel="noopener noreferrer" title="Ver fotos" className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <Camera className="h-4 w-4" />
          </a>
        )}
        {p.transmissaoUrl && (
          <a href={p.transmissaoUrl} target="_blank" rel="noopener noreferrer" title="Assistir transmissão" className="rounded-full p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
            <Video className="h-4 w-4" />
          </a>
        )}
        <button
          type="button"
          onClick={onCard}
          title="Gerar card do jogo"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50"
        >
          <ImageIcon className="h-4 w-4" />
          Card
        </button>
      </div>
    </article>
  );
}

export default function CategoriaDetalhesContent({ torneio, categoria }: Props) {
  const ordemFases = ["GRUPOS", "OITAVAS", "QUARTAS", "SEMI", "FINAL"] as const;
  const mostrarColunasPorPontos = Boolean(torneio.superCampeonato);
  const [tab, setTab] = useState<"inscritos" | "classificacao" | "jogos">("inscritos");
  const [fase, setFase] = useState("GRUPOS");
  const [filtroJogos, setFiltroJogos] = useState<"todos" | "pendentes" | "encerrados">("todos");
  
  const [inscritos, setInscritos] = useState<Inscrito[]>([]);
  const [classificacao, setClassificacao] = useState<ClassificacaoGrupo[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [fasesDisponiveis, setFasesDisponiveis] = useState<string[]>(["GRUPOS"]);
  
  const [loading, setLoading] = useState(false);

  async function gerarCardPublico(p: Partida) {
    await gerarCardPartidaAdmin({
      torneioNome: torneio.nome,
      categoriaNome: categoria.nome,
      templateUrl: torneio.templateUrl ?? null,
      layout: torneio.layoutCards ?? null,
      syncFotosUrl: `/api/public/torneios/${torneio.slug}/categorias/${categoria.id}/partidas/${p.id}/sincronizar-fotos`,
      partida: {
        id: p.id,
        fase: p.fase,
        rodadaNome: p.rodadaNome,
        rodadaNumero: p.rodadaNumero,
        dataHorario: p.dataHorario,
        arenaNome: p.arenaNome ?? null,
        quadra: p.quadra,
        equipeANome: p.equipeANome,
        equipeBNome: p.equipeBNome,
        equipeAAtletas: p.equipeAAtletas ?? [],
        equipeBAtletas: p.equipeBAtletas ?? [],
      },
    });
  }

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

  const partidasPorRodada = useMemo(() => {
    const grupos = new Map<number, { nome: string; dataLimite: string | null; jogos: Partida[] }>();

    partidas.forEach((p) => {
      const num = p.rodadaNumero ?? 0;
      const atual: { nome: string; dataLimite: string | null; jogos: Partida[] } = grupos.get(num) ?? {
        nome: p.rodadaNome || `Rodada ${num}`,
        dataLimite: p.rodadaDataLimite ?? p.dataLimite ?? null,
        jogos: [],
      };
      if (!atual.dataLimite && (p.rodadaDataLimite || p.dataLimite)) {
        atual.dataLimite = p.rodadaDataLimite ?? p.dataLimite ?? null;
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
                            {mostrarColunasPorPontos ? <th className="px-2 py-3 text-center font-medium" title="Pontos">P</th> : null}
                            <th className="px-2 py-3 text-center font-medium" title="Jogos">J</th>
                            <th className="px-2 py-3 text-center font-medium" title="Vitórias">V</th>
                            <th className="px-2 py-3 text-center font-medium" title="Sets Pró">SP</th>
                            <th className="px-2 py-3 text-center font-medium" title="Games Pró">GP</th>
                            <th className="px-2 py-3 text-center font-medium" title="Saldo de Games">SG</th>
                            {mostrarColunasPorPontos ? <th className="px-2 py-3 text-center font-medium" title="Aproveitamento">AP%</th> : null}
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
                              {mostrarColunasPorPontos ? <td className="px-2 py-3 text-center font-bold text-slate-900">{e.pontos}</td> : null}
                              <td className="px-2 py-3 text-center text-slate-600">{e.jogosJogados}</td>
                              <td className="px-2 py-3 text-center text-slate-600">{e.jogosVencidos}</td>
                              <td className="px-2 py-3 text-center text-slate-600">{e.setsPro}</td>
                              <td className="px-2 py-3 text-center text-slate-600">{e.gamesPro}</td>
                              <td className="px-2 py-3 text-center text-slate-600">{e.saldoGames}</td>
                              {mostrarColunasPorPontos ? (
                                <td className="px-2 py-3 text-center text-slate-600">
                                  {e.jogosJogados > 0 ? `${Math.round((e.pontos / (e.jogosJogados * 3)) * 100)}%` : "0%"}
                                </td>
                              ) : null}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {fasesDisponiveis.length > 1 ? (
                  <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    {fasesDisponiveis.map((f) => (
                      <button
                        key={f}
                        onClick={() => setFase(f)}
                        className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                          fase === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {NOME_FASE[f] ?? f}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm font-bold text-slate-700">{NOME_FASE[fase] ?? fase}</div>
                )}
                <div className="flex gap-1 self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:self-auto">
                  {(
                    [
                      ["todos", "Todos"],
                      ["pendentes", "A jogar"],
                      ["encerrados", "Encerrados"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      onClick={() => setFiltroJogos(valor)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        filtroJogos === valor ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>

              {partidas.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
                  Nenhum jogo encontrado nesta fase.
                </div>
              ) : (
                <div className="space-y-6">
                  {partidasPorRodada.map(([num, dados]) => {
                    const encerrados = dados.jogos.filter(jogoEncerrado).length;
                    const visiveis = dados.jogos
                      .map((p, idx) => ({ p, numero: idx + 1 }))
                      .filter(({ p }) =>
                        filtroJogos === "todos" ? true : filtroJogos === "encerrados" ? jogoEncerrado(p) : !jogoEncerrado(p)
                      );
                    if (visiveis.length === 0) return null;
                    const prazo = situacaoPrazo(dados.dataLimite, encerrados === dados.jogos.length);
                    return (
                      <section key={num}>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-baseline gap-3">
                            <h3 className="text-lg font-extrabold text-slate-900">{dados.nome}</h3>
                            <span className="text-xs font-semibold text-slate-500">
                              {encerrados}/{dados.jogos.length} jogos encerrados
                            </span>
                          </div>
                          {dados.dataLimite && (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${prazo.classe}`}>
                              <Clock className="h-3.5 w-3.5" />
                              {prazo.rotulo} {formatarDataSemFuso(dados.dataLimite)}
                            </span>
                          )}
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(encerrados / dados.jogos.length) * 100}%` }} />
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {visiveis.map(({ p, numero }) => (
                            <JogoPublico key={p.id} partida={p} numero={numero} onCard={() => gerarCardPublico(p)} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
