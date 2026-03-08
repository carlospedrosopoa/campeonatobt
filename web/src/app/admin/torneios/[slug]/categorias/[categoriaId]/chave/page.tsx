"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Banknote, Gamepad2, Network, RefreshCcw } from "lucide-react";

type Categoria = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
};

type Fase = "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL";

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
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

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

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const cat = await carregarCategoria();
        if (!ativo) return;
        setCategoria(cat);
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
      expected.SEMI = Math.max(0, Math.floor(baseCount / 2));
      expected.FINAL = expected.SEMI > 0 ? 1 : 0;
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

    return out;
  }, [jogosPorFase]);

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
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

