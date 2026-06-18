"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Banknote, Gamepad2, Network, Pencil, RefreshCcw, Save } from "lucide-react";

type Categoria = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
};

type Fase = "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL";

type GrupoClassificacao = {
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
    setsPro?: number;
  }[];
};

type Inscricao = {
  status: string;
  equipe: { id: string; nome: string | null };
};

type Partida = {
  id: string;
  fase: Fase;
  status: string;
  equipeAId: string;
  equipeBId: string;
  equipeANome: string | null;
  equipeBNome: string | null;
  vencedorId: string | null;
  placarA: number;
  placarB: number;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

function partidaIniciada(p: Partida) {
  if (p.status !== "AGENDADA") return true;
  if (p.vencedorId) return true;
  if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
  if (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0) return true;
  return false;
}

function formatPlacar(detalhes: Partida["detalhesPlacar"]) {
  if (!detalhes || detalhes.length === 0) return "-";
  return detalhes
    .slice()
    .sort((a, b) => a.set - b.set)
    .map((s) => {
      if (s.tiebreak && s.tbA !== undefined && s.tbB !== undefined) {
        return `${s.a}-${s.b} (${s.tbA}-${s.tbB})`;
      }
      return `${s.a}-${s.b}`;
    })
    .join(" ");
}

function nomeFase(f: Fase) {
  if (f === "OITAVAS") return "Oitavas";
  if (f === "QUARTAS") return "Quartas";
  if (f === "SEMI") return "Semifinal";
  return "Final";
}

function placeholderMatch(fase: Fase, index: number): Partida {
  return {
    id: `placeholder:${fase}:${index}`,
    fase,
    status: "AGUARDANDO",
    equipeAId: "aguardando",
    equipeBId: "aguardando",
    equipeANome: "Aguardando",
    equipeBNome: "Aguardando",
    vencedorId: null,
    placarA: 0,
    placarB: 0,
    detalhesPlacar: null,
  };
}

export default function AdminCategoriaChavePage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [superCampeonato, setSuperCampeonato] = useState(false);
  const [classificacao, setClassificacao] = useState<GrupoClassificacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);
  const [carregandoEquipes, setCarregandoEquipes] = useState(false);
  const [editConfrontoId, setEditConfrontoId] = useState<string | null>(null);
  const [confrontoEquipeAId, setConfrontoEquipeAId] = useState("");
  const [confrontoEquipeBId, setConfrontoEquipeBId] = useState("");
  const [salvandoConfronto, setSalvandoConfronto] = useState(false);
  const [substituicaoEquipeOrigemId, setSubstituicaoEquipeOrigemId] = useState("");
  const [substituicaoEquipeDestinoId, setSubstituicaoEquipeDestinoId] = useState("");
  const [substituindoEquipe, setSubstituindoEquipe] = useState(false);
  const [modoManutencaoConfronto, setModoManutencaoConfronto] = useState(false);

  const [jogosPorFase, setJogosPorFase] = useState<Record<Fase, Partida[]>>({
    OITAVAS: [],
    QUARTAS: [],
    SEMI: [],
    FINAL: [],
  });

  async function carregarCategoria() {
    const resCat = await fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" });
    if (!resCat.ok) {
      const msg = await resCat.json().catch(() => null);
      throw new Error(msg?.error || "Falha ao carregar categoria");
    }
    const cats = (await resCat.json()) as Categoria[];
    return cats.find((c) => c.id === categoriaId) ?? null;
  }

  async function carregarChave() {
    const fases: Fase[] = ["OITAVAS", "QUARTAS", "SEMI", "FINAL"];
    const results = await Promise.all(
      fases.map(async (f): Promise<[Fase, Partida[]]> => {
        const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=${f}`, { cache: "no-store" });
        if (!res.ok) return [f, []];
        const rows = (await res.json()) as Partida[];
        const sorted = rows.slice().sort((a, b) => a.id.localeCompare(b.id));
        return [f, sorted];
      })
    );

    const map = { OITAVAS: [], QUARTAS: [], SEMI: [], FINAL: [] } as Record<Fase, Partida[]>;
    for (const [f, rows] of results) map[f] = rows;
    setJogosPorFase(map);
  }

  async function carregarTorneioSuper() {
    const res = await fetch(`/api/v1/torneios/${slug}`, { cache: "no-store" });
    if (!res.ok) return false;
    const t = (await res.json()) as any;
    return Boolean(t?.superCampeonato);
  }

  async function carregarClassificacao() {
    const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
    if (!res.ok) return [];
    const rows = (await res.json()) as GrupoClassificacao[];
    return Array.isArray(rows) ? rows : [];
  }

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const cat = await carregarCategoria();
        if (!ativo) return;
        setCategoria(cat);
        const [isSuper, classRows] = await Promise.all([carregarTorneioSuper(), carregarClassificacao()]);
        if (!ativo) return;
        setSuperCampeonato(isSuper);
        setClassificacao(classRows);
        await carregarChave();
      } catch (e: any) {
        if (!ativo) return;
        setErro(e?.message || "Erro inesperado");
      } finally {
        if (!ativo) return;
        setCarregando(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [slug, categoriaId]);

  const superTop2 = useMemo(() => {
    if (!superCampeonato) return null;
    const g0 = classificacao[0];
    const a = g0?.equipes?.[0];
    const b = g0?.equipes?.[1];
    if (!a || !b) return null;
    return { s1: a, s2: b };
  }, [classificacao, superCampeonato]);

  const fasesView = useMemo(() => {
    const base =
      jogosPorFase.OITAVAS.length > 0
        ? "OITAVAS"
        : jogosPorFase.QUARTAS.length > 0
          ? "QUARTAS"
          : jogosPorFase.SEMI.length > 0
            ? "SEMI"
            : jogosPorFase.FINAL.length > 0
              ? "FINAL"
              : null;

    if (!base) return { OITAVAS: [] as Partida[], QUARTAS: [] as Partida[], SEMI: [] as Partida[], FINAL: [] as Partida[] };

    const baseCount = jogosPorFase[base as Fase].length;
    const expected: Record<Fase, number> = { OITAVAS: 0, QUARTAS: 0, SEMI: 0, FINAL: 0 };

    if (base === "OITAVAS") {
      expected.OITAVAS = baseCount;
      expected.QUARTAS = Math.max(0, Math.floor(baseCount / 2));
      expected.SEMI = Math.max(0, Math.floor(expected.QUARTAS / 2));
      expected.FINAL = expected.SEMI > 0 ? 1 : 0;
    } else if (base === "QUARTAS") {
      expected.QUARTAS = baseCount;
      if (superCampeonato && baseCount === 2) {
        expected.SEMI = 2;
        expected.FINAL = 1;
      } else {
        expected.SEMI = Math.max(0, Math.floor(baseCount / 2));
        expected.FINAL = expected.SEMI > 0 ? 1 : 0;
      }
    } else if (base === "SEMI") {
      expected.SEMI = baseCount;
      expected.FINAL = expected.SEMI > 0 ? 1 : 0;
    } else {
      expected.FINAL = baseCount;
    }

    const out: Record<Fase, Partida[]> = { ...jogosPorFase };
    const fill = (fase: Fase) => {
      const want = expected[fase];
      if (want <= 0) return;
      const cur = out[fase] ?? [];
      if (cur.length >= want) return;
      const extras = Array.from({ length: want - cur.length }, (_, i) => placeholderMatch(fase, cur.length + i + 1));
      out[fase] = [...cur, ...extras];
    };

    fill("OITAVAS");
    fill("QUARTAS");
    fill("SEMI");
    fill("FINAL");

    if (superCampeonato && base === "QUARTAS" && expected.SEMI === 2 && out.SEMI.length === 2) {
      const s1 = superTop2?.s1;
      const s2 = superTop2?.s2;
      if (s1 && out.SEMI[0]?.id.startsWith("placeholder:")) {
        out.SEMI[0] = {
          ...out.SEMI[0],
          equipeAId: s1.equipeId,
          equipeANome: s1.equipeNome || "1º colocado",
          equipeBId: "aguardando",
          equipeBNome: "Aguardando vencedor das quartas",
        };
      }
      if (s2 && out.SEMI[1]?.id.startsWith("placeholder:")) {
        out.SEMI[1] = {
          ...out.SEMI[1],
          equipeAId: s2.equipeId,
          equipeANome: s2.equipeNome || "2º colocado",
          equipeBId: "aguardando",
          equipeBNome: "Aguardando vencedor das quartas",
        };
      }
    }

    return out;
  }, [jogosPorFase, superCampeonato, superTop2]);

  const partidaEditando = useMemo(() => {
    if (!editConfrontoId) return null;
    return (Object.values(jogosPorFase).flat() as Partida[]).find((p) => p.id === editConfrontoId) ?? null;
  }, [editConfrontoId, jogosPorFase]);

  const equipesDaFaseEditando = useMemo(() => {
    if (!partidaEditando) return [];
    const jogos = jogosPorFase[partidaEditando.fase] ?? [];
    const mapa = new Map<string, string>();
    for (const jogo of jogos) {
      if (jogo.equipeAId && !jogo.equipeAId.startsWith("aguardando")) {
        mapa.set(jogo.equipeAId, jogo.equipeANome || jogo.equipeAId.slice(0, 8));
      }
      if (jogo.equipeBId && !jogo.equipeBId.startsWith("aguardando")) {
        mapa.set(jogo.equipeBId, jogo.equipeBNome || jogo.equipeBId.slice(0, 8));
      }
    }
    return Array.from(mapa.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [partidaEditando, jogosPorFase]);

  async function abrirAlterarConfronto(p: Partida) {
    setEditConfrontoId(p.id);
    setConfrontoEquipeAId(p.equipeAId);
    setConfrontoEquipeBId(p.equipeBId);
    setSubstituicaoEquipeOrigemId(p.equipeAId);
    setSubstituicaoEquipeDestinoId("");
    setModoManutencaoConfronto(false);
    if (equipes.length > 0) return;
    try {
      setCarregandoEquipes(true);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/inscricoes`, { cache: "no-store" });
      if (!res.ok) return;
      const rows = (await res.json()) as Inscricao[];
      const aprovadas = rows
        .filter((i) => i.status === "APROVADA")
        .map((i) => ({ id: i.equipe.id, nome: (i.equipe.nome || i.equipe.id.slice(0, 8)).trim() }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setEquipes(aprovadas);
    } finally {
      setCarregandoEquipes(false);
    }
  }

  if (carregando) return <div className="text-sm text-slate-600">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{categoria ? `Chave — ${categoria.nome}` : "Chave"}</h1>
          <p className="text-sm text-slate-600">Acompanhamento do mata-mata em colunas.</p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1">
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/inscricoes`}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Banknote className="h-4 w-4" />
              Inscrições
            </Link>
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/jogos`}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Gamepad2 className="h-4 w-4" />
              Jogos
            </Link>
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/chave`}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Network className="h-4 w-4" />
              Chave
            </Link>
          </div>
        </div>

        <button
          type="button"
          disabled={atualizando}
          onClick={async () => {
            try {
              setAtualizando(true);
              const [isSuper, classRows] = await Promise.all([carregarTorneioSuper(), carregarClassificacao()]);
              setSuperCampeonato(isSuper);
              setClassificacao(classRows);
              await carregarChave();
            } finally {
              setAtualizando(false);
            }
          }}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" />
          {atualizando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="overflow-x-auto">
        <div className="min-w-[960px] grid grid-cols-4 gap-6">
          {(["OITAVAS", "QUARTAS", "SEMI", "FINAL"] as Fase[]).map((fase) => {
            const jogos = fasesView[fase];
            const visible = jogos.length > 0;
            if (!visible) {
              return (
                <div key={fase} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                  <div className="text-xs text-slate-500 uppercase tracking-wider">{nomeFase(fase)}</div>
                  <div className="mt-4 text-sm text-slate-500">Sem jogos nesta fase.</div>
                </div>
              );
            }
            return (
              <div key={fase} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs text-slate-500 uppercase tracking-wider">{nomeFase(fase)}</div>
                <div className="mt-4 space-y-4">
                  {jogos.map((p) => {
                    const winnerA = p.vencedorId && p.vencedorId === p.equipeAId;
                    const winnerB = p.vencedorId && p.vencedorId === p.equipeBId;
                    return (
                      <div key={p.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`font-semibold truncate ${winnerA ? "text-slate-900" : "text-slate-700"}`}>{p.equipeANome || p.equipeAId.slice(0, 8)}</div>
                            <div className={`font-semibold truncate ${winnerB ? "text-slate-900" : "text-slate-700"}`}>{p.equipeBNome || p.equipeBId.slice(0, 8)}</div>
                            <div className="text-xs text-slate-500 mt-1">{p.status}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900">{p.status === "AGUARDANDO" ? "-" : formatPlacar(p.detalhesPlacar)}</div>
                          </div>
                        </div>
                        {!p.id.startsWith("placeholder:") ? (
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => void abrirAlterarConfronto(p)}
                              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Alterar confronto
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {partidaEditando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditConfrontoId(null)}>
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-lg font-semibold text-slate-900">Manutenção da chave</div>
              <div className="mt-1 text-sm text-slate-600">
                Ajuste o confronto de {nomeFase(partidaEditando.fase)} antes do início dos jogos.
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Dupla A</label>
                  <select
                    value={confrontoEquipeAId}
                    onChange={(e) => setConfrontoEquipeAId(e.target.value)}
                    disabled={carregandoEquipes}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                  >
                    {equipes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Dupla B</label>
                  <select
                    value={confrontoEquipeBId}
                    onChange={(e) => setConfrontoEquipeBId(e.target.value)}
                    disabled={carregandoEquipes}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                  >
                    {equipes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={modoManutencaoConfronto}
                    onChange={(e) => setModoManutencaoConfronto(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Ativar modo manutenção da fase
                </label>
                <div className="mt-2 text-xs text-slate-600">
                  Use quando a chave já veio pronta e você precisa reorganizar vários confrontos antes de qualquer jogo da fase começar.
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">Substituir dupla na fase</div>
                <div className="mt-1 text-xs text-slate-600">
                  Troca uma dupla em toda a fase atual e remove as fases seguintes para os jogos serem gerados novamente depois.
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Dupla atual na fase</label>
                    <select
                      value={substituicaoEquipeOrigemId}
                      onChange={(e) => setSubstituicaoEquipeOrigemId(e.target.value)}
                      disabled={substituindoEquipe}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                    >
                      {equipesDaFaseEditando.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Nova dupla</label>
                    <select
                      value={substituicaoEquipeDestinoId}
                      onChange={(e) => setSubstituicaoEquipeDestinoId(e.target.value)}
                      disabled={carregandoEquipes || substituindoEquipe}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                    >
                      <option value="">Selecione...</option>
                      {equipes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditConfrontoId(null)}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setSubstituindoEquipe(true);
                    setErro(null);
                    const res = await fetch(
                      `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partidaEditando.id}/substituir-equipe`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          equipeOrigemId: substituicaoEquipeOrigemId,
                          equipeDestinoId: substituicaoEquipeDestinoId,
                        }),
                      }
                    );
                    const payload = (await res.json().catch(() => null)) as any;
                    if (!res.ok) throw new Error(payload?.error || "Falha ao substituir dupla na fase");
                    await carregarChave();
                    setEditConfrontoId(null);
                    setModoManutencaoConfronto(false);
                  } catch (e: any) {
                    setErro(e?.message || "Erro inesperado");
                  } finally {
                    setSubstituindoEquipe(false);
                  }
                }}
                disabled={
                  substituindoEquipe ||
                  carregandoEquipes ||
                  !substituicaoEquipeOrigemId ||
                  !substituicaoEquipeDestinoId ||
                  substituicaoEquipeOrigemId === substituicaoEquipeDestinoId
                }
                className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {substituindoEquipe ? "Substituindo..." : "Substituir na fase"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setSalvandoConfronto(true);
                    setErro(null);
                    if (partidaIniciada(partidaEditando)) {
                      throw new Error("Não é possível alterar confronto depois que a partida foi iniciada");
                    }
                    const res = await fetch(
                      `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partidaEditando.id}/alterar-confronto`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          equipeAId: confrontoEquipeAId,
                          equipeBId: confrontoEquipeBId,
                          force: modoManutencaoConfronto,
                        }),
                      }
                    );
                    const payload = (await res.json().catch(() => null)) as any;
                    if (!res.ok) throw new Error(payload?.error || "Falha ao alterar confronto");
                    await carregarChave();
                    setEditConfrontoId(null);
                    setModoManutencaoConfronto(false);
                  } catch (e: any) {
                    setErro(e?.message || "Erro inesperado");
                  } finally {
                    setSalvandoConfronto(false);
                  }
                }}
                disabled={salvandoConfronto || carregandoEquipes || !confrontoEquipeAId || !confrontoEquipeBId || confrontoEquipeAId === confrontoEquipeBId}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {salvandoConfronto ? "Salvando..." : "Salvar confronto"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
