"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Trophy, X } from "lucide-react";

type Torneio = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  dataInicio: string;
  dataFim: string;
  local: string;
  status: string;
  bannerUrl: string | null;
  logoUrl: string | null;
  superCampeonato: boolean;
  esporteNome: string | null;
  categorias: {
    id: string;
    nome: string;
    genero: string;
    valorInscricao: string | null;
    vagasMaximas: number | null;
    inscritos: number;
    inscricoesAbertas?: boolean;
  }[];
};

type Inscricao = {
  id: string;
  status: string;
  dataInscricao: string;
  torneio: { id: string; nome: string; slug: string };
  categoria: { id: string; nome: string };
  equipe: { id: string; nome: string | null; atletas: { id: string; nome: string; email: string; telefone: string | null }[] };
};

type ParceiroBusca = {
  id: string;
  nome: string;
  telefone?: string | null;
  fotoUrl?: string | null;
  email?: string | null;
};

function formatDateRange(ini?: string | null, fim?: string | null) {
  const d1 = ini ? new Date(ini) : null;
  const d2 = fim ? new Date(fim) : null;
  if (!d1 || Number.isNaN(d1.getTime()) || !d2 || Number.isNaN(d2.getTime())) return null;
  const a = d1.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const b = d2.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${a}–${b}`;
}

function statusBadge(status: string) {
  const base = "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold";
  if (status === "ABERTO") return <span className={`${base} bg-emerald-100 text-emerald-700`}>Aberto</span>;
  if (status === "EM_ANDAMENTO") return <span className={`${base} bg-blue-100 text-blue-700`}>Em andamento</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>{status}</span>;
}

function getInitials(nome: string) {
  const parts = (nome || "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function AtletaTorneiosPage() {
  const [tab, setTab] = useState<"torneios" | "inscricoes">("torneios");

  const [torneios, setTorneios] = useState<Torneio[]>([]);
  const [carregandoTorneios, setCarregandoTorneios] = useState(true);
  const [erroTorneios, setErroTorneios] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);

  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [carregandoInscricoes, setCarregandoInscricoes] = useState(false);
  const [erroInscricoes, setErroInscricoes] = useState<string | null>(null);

  const [modalCategoria, setModalCategoria] = useState<{ torneio: Torneio; categoriaId: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [equipeNome, setEquipeNome] = useState("");
  const [buscaParceiro, setBuscaParceiro] = useState("");
  const [parceiros, setParceiros] = useState<ParceiroBusca[]>([]);
  const [carregandoParceiros, setCarregandoParceiros] = useState(false);
  const [parceiroSelecionado, setParceiroSelecionado] = useState<ParceiroBusca | null>(null);
  const [erroModal, setErroModal] = useState<string | null>(null);

  async function carregarTorneios() {
    try {
      setCarregandoTorneios(true);
      setErroTorneios(null);
      const res = await fetch("/api/v1/atleta/torneios", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar torneios");
      setTorneios((data as Torneio[]) ?? []);
    } catch (e: any) {
      setErroTorneios(e?.message || "Erro ao carregar torneios");
    } finally {
      setCarregandoTorneios(false);
    }
  }

  async function carregarInscricoes() {
    try {
      setCarregandoInscricoes(true);
      setErroInscricoes(null);
      const res = await fetch("/api/v1/atleta/inscricoes", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar inscrições");
      setInscricoes((data as Inscricao[]) ?? []);
    } catch (e: any) {
      setErroInscricoes(e?.message || "Erro ao carregar inscrições");
    } finally {
      setCarregandoInscricoes(false);
    }
  }

  useEffect(() => {
    void carregarTorneios();
  }, []);

  useEffect(() => {
    if (tab !== "inscricoes") return;
    void carregarInscricoes();
  }, [tab]);

  useEffect(() => {
    if (!modalCategoria) return;
    const q = buscaParceiro.trim();
    setErroModal(null);
    if (q.length < 2) {
      setParceiros([]);
      setCarregandoParceiros(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setCarregandoParceiros(true);
        const sp = new URLSearchParams();
        sp.set("q", q);
        sp.set("limite", "20");
        const res = await fetch(`/api/v1/atleta/parceiros?${sp.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha ao buscar atletas");
        const atletas = (data?.atletas as any[]) ?? [];
        setParceiros(
          atletas.map((a) => ({
            id: String(a.id),
            nome: String(a.nome || ""),
            telefone: a.telefone ?? null,
            fotoUrl: a.fotoUrl ?? null,
            email: a.email ?? null,
          }))
        );
      } catch (e: any) {
        setParceiros([]);
        setErroModal(e?.message || "Falha ao buscar atletas");
      } finally {
        setCarregandoParceiros(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [buscaParceiro, modalCategoria]);

  const header = useMemo(() => {
    const label = tab === "torneios" ? "Torneios" : "Minhas inscrições";
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="w-6 h-6 text-blue-600" />
          {label}
        </h1>
        <p className="text-sm text-gray-600">Gerencie suas inscrições no Play Na Quadra - Competições.</p>
      </div>
    );
  }, [tab]);

  if (carregandoTorneios && tab === "torneios") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse bg-white rounded-xl shadow-lg p-8">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          {header}
          <div className="flex items-center gap-2">
            <Link
              href="/atleta/jogos"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold"
            >
              Meus jogos
            </Link>
            <form action="/api/v1/auth/logout" method="post">
              <button type="submit" className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold">
                Sair
              </button>
            </form>
          </div>
        </div>

        {flashOk && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{flashOk}</div>}
        {tab === "torneios" && erroTorneios && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erroTorneios}</div>}
        {tab === "inscricoes" && erroInscricoes && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erroInscricoes}</div>}

        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("torneios")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              tab === "torneios" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Torneios
          </button>
          <button
            type="button"
            onClick={() => setTab("inscricoes")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              tab === "inscricoes" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Minhas inscrições
          </button>
        </div>

        {tab === "torneios" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => carregarTorneios()}
                disabled={carregandoTorneios}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {carregandoTorneios ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            {torneios.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum torneio disponível</p>
                <p className="text-gray-500 text-sm mt-1">Quando as inscrições abrirem, os torneios aparecerão aqui.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {torneios.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold text-gray-900 truncate">{t.nome}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {statusBadge(t.status)}
                            {t.esporteNome && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                                {t.esporteNome}
                              </span>
                            )}
                          </div>
                        </div>
                        <Link href={`/torneios/${t.slug}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                          Ver
                        </Link>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{formatDateRange(t.dataInicio, t.dataFim) || "Datas a definir"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="truncate">{t.local}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">Categorias</div>
                      {t.categorias.length === 0 ? (
                        <div className="text-sm text-gray-600">Sem categorias cadastradas.</div>
                      ) : (
                        <div className="space-y-2">
                          {t.categorias.map((c) => (
                            <div key={c.id} className="rounded-lg border border-gray-200 p-4 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900">{c.nome}</div>
                                <div className="text-xs text-gray-600 mt-1">
                                  {c.valorInscricao
                                    ? `${Number(c.valorInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por atleta`
                                    : "Sem taxa"}
                                  <span className="mx-1">•</span>
                                  {c.inscritos} {c.inscritos === 1 ? "inscrito" : "inscritos"}
                                </div>
                              </div>
                              {c.inscricoesAbertas === false ? (
                                <span className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold whitespace-nowrap">
                                  Inscrições encerradas
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setErroModal(null);
                                    setEquipeNome("");
                                    setBuscaParceiro("");
                                    setParceiros([]);
                                    setParceiroSelecionado(null);
                                    setModalCategoria({ torneio: t, categoriaId: c.id });
                                  }}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold whitespace-nowrap"
                                >
                                  Inscrever
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => carregarInscricoes()}
                disabled={carregandoInscricoes}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {carregandoInscricoes ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            {carregandoInscricoes ? (
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-24 bg-gray-200 rounded"></div>
                </div>
              </div>
            ) : inscricoes.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Você ainda não tem inscrições</p>
                <p className="text-gray-500 text-sm mt-1">Abra um torneio e clique em Inscrever para começar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {inscricoes.map((i) => (
                  <div key={i.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-gray-900 truncate">{i.torneio.nome}</div>
                          <div className="text-sm text-gray-600 truncate mt-1">{i.categoria.nome}</div>
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 whitespace-nowrap">
                          {i.status}
                        </span>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{i.equipe.nome || "Dupla"}</div>
                        <div className="mt-3 space-y-2 text-sm">
                          {i.equipe.atletas.map((a) => (
                            <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                              <span className="font-medium text-gray-900 truncate">{a.nome}</span>
                              <span className="text-gray-600 truncate">{a.email}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modalCategoria && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setModalCategoria(null)}>
          <div className="w-full max-w-xl bg-white rounded-xl shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-6">
              <div>
                <div className="text-xs text-gray-500">Inscrição</div>
                <div className="text-lg font-semibold text-gray-900">{modalCategoria.torneio.nome}</div>
                <div className="mt-1 text-sm text-gray-600">Informe os dados do parceiro para criar a dupla.</div>
              </div>
              <button type="button" onClick={() => setModalCategoria(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {erroModal && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erroModal}</div>}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Nome da dupla (opcional)</label>
                  <input
                    value={equipeNome}
                    onChange={(e) => setEquipeNome(e.target.value)}
                    placeholder="Ex: Os Invencíveis"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Buscar parceiro</label>
                <input
                  value={buscaParceiro}
                  onChange={(e) => {
                    setBuscaParceiro(e.target.value);
                    setParceiroSelecionado(null);
                  }}
                  placeholder="Digite nome ou telefone (mín. 2 caracteres)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                {carregandoParceiros && <div className="text-sm text-gray-600">Buscando...</div>}
              </div>

              {parceiroSelecionado ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    {parceiroSelecionado.fotoUrl ? (
                      <img
                        src={parceiroSelecionado.fotoUrl}
                        alt={parceiroSelecionado.nome}
                        className="h-10 w-10 rounded-full object-cover border border-gray-200 bg-white"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-sm font-semibold border border-gray-200">
                        {getInitials(parceiroSelecionado.nome)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{parceiroSelecionado.nome}</div>
                      <div className="text-sm text-gray-600 truncate">{parceiroSelecionado.email || "Sem email"}</div>
                      {parceiroSelecionado.telefone && <div className="text-sm text-gray-600 truncate">{parceiroSelecionado.telefone}</div>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParceiroSelecionado(null)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold"
                  >
                    Trocar
                  </button>
                </div>
              ) : parceiros.length > 0 ? (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="max-h-64 overflow-auto divide-y divide-gray-100">
                    {parceiros.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setParceiroSelecionado(p)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {p.fotoUrl ? (
                            <img
                              src={p.fotoUrl}
                              alt={p.nome}
                              className="h-10 w-10 rounded-full object-cover border border-gray-200 bg-white"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-sm font-semibold border border-gray-200">
                              {getInitials(p.nome)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{p.nome}</div>
                            <div className="text-sm text-gray-600 truncate">{p.email || "Sem email"}</div>
                            {p.telefone && <div className="text-sm text-gray-600 truncate">{p.telefone}</div>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : buscaParceiro.trim().length >= 2 && !carregandoParceiros ? (
                <div className="text-sm text-gray-600">Nenhum atleta encontrado.</div>
              ) : null}

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalCategoria(null)}
                  disabled={salvando}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (!parceiroSelecionado?.id || !parceiroSelecionado.email) {
                        setErroModal("Selecione um parceiro com perfil no Play na Quadra");
                        return;
                      }
                      setSalvando(true);
                      setErroModal(null);
                      setFlashOk(null);
                      const res = await fetch("/api/v1/atleta/inscricoes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          categoriaId: modalCategoria.categoriaId,
                          equipeNome: equipeNome.trim() || null,
                          parceiro: {
                            playnaquadraAtletaId: parceiroSelecionado.id,
                            nome: parceiroSelecionado.nome,
                            email: parceiroSelecionado.email,
                            telefone: parceiroSelecionado.telefone || null,
                          },
                        }),
                      });
                      const data = (await res.json().catch(() => null)) as any;
                      if (!res.ok) throw new Error(data?.error || "Falha ao criar inscrição");
                      setFlashOk("Inscrição criada. Aguardando confirmação.");
                      void carregarInscricoes();
                      setTab("inscricoes");
                      setModalCategoria(null);
                    } catch (e: any) {
                      setErroModal(e?.message || "Falha ao criar inscrição");
                    } finally {
                      setSalvando(false);
                    }
                  }}
                  disabled={salvando || !parceiroSelecionado?.id || !parceiroSelecionado.email}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {salvando ? "Enviando..." : "Confirmar inscrição"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

