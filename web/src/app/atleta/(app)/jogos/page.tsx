"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";

type Partida = {
  id: string;
  torneio: { id: string; nome: string; slug: string };
  categoria: { id: string; nome: string };
  fase: string;
  status: string;
  equipeA: { id: string; nome: string | null };
  equipeB: { id: string; nome: string | null };
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  dataHorario: string | null;
  quadra: string | null;
  meuLado: "A" | "B" | null;
};

function formatDataHora(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AtletaJogosPage() {
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<Partida | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [s1a, setS1a] = useState("");
  const [s1b, setS1b] = useState("");
  const [s2a, setS2a] = useState("");
  const [s2b, setS2b] = useState("");
  const [s3a, setS3a] = useState("");
  const [s3b, setS3b] = useState("");

  async function carregar() {
    try {
      setErro(null);
      setCarregando(true);
      const res = await fetch("/api/v1/atleta/partidas", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar jogos");
      setPartidas((data?.partidas as Partida[]) ?? []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar jogos");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const partidasOrdenadas = useMemo(() => {
    return partidas.slice().sort((a, b) => {
      const da = a.dataHorario ? new Date(a.dataHorario).getTime() : 0;
      const db = b.dataHorario ? new Date(b.dataHorario).getTime() : 0;
      return db - da;
    });
  }, [partidas]);

  function abrirModal(p: Partida) {
    setModal(p);
    setS1a("");
    setS1b("");
    setS2a("");
    setS2b("");
    setS3a("");
    setS3b("");
  }

  async function enviarPlacar() {
    if (!modal) return;
    const detalhes: Array<{ set: number; a: number; b: number }> = [];
    const p1a = s1a.trim() === "" ? null : Number(s1a);
    const p1b = s1b.trim() === "" ? null : Number(s1b);
    const p2a = s2a.trim() === "" ? null : Number(s2a);
    const p2b = s2b.trim() === "" ? null : Number(s2b);
    const p3a = s3a.trim() === "" ? null : Number(s3a);
    const p3b = s3b.trim() === "" ? null : Number(s3b);

    if (p1a === null || p1b === null || p2a === null || p2b === null) {
      setErro("Informe pelo menos os 2 primeiros sets.");
      return;
    }

    detalhes.push({ set: 1, a: p1a, b: p1b });
    detalhes.push({ set: 2, a: p2a, b: p2b });
    if (p3a !== null && p3b !== null) detalhes.push({ set: 3, a: p3a, b: p3b });

    try {
      setErro(null);
      setSalvando(true);
      const res = await fetch(`/api/v1/atleta/partidas/${modal.id}/placar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalhesPlacar: detalhes }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao enviar placar");
      alert("Placar enviado para confirmação da arbitragem.");
      setModal(null);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao enviar placar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-orange-500" />
            <div>
              <div className="font-bold text-slate-900">Meus jogos</div>
              <div className="text-xs text-slate-500">Informe o placar e aguarde a confirmação da arbitragem.</div>
            </div>
          </div>
          <Link href="/atleta/torneios" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-4">
        {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

        {carregando ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-white border border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : partidasOrdenadas.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-100 p-8 text-center text-slate-500">
            Nenhum jogo encontrado para o seu usuário.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {partidasOrdenadas.map((p) => (
              <div key={p.id} className="rounded-xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
                <div className="text-xs font-semibold text-slate-500">{p.torneio.nome} • {p.categoria.nome}</div>
                <div className="text-sm font-bold text-slate-900">{p.equipeA.nome || "Equipe A"} x {p.equipeB.nome || "Equipe B"}</div>
                <div className="text-xs text-slate-600">
                  {formatDataHora(p.dataHorario) || "Horário a definir"}{p.quadra ? ` • Q. ${p.quadra}` : ""} • {p.status}
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <Link
                    href={`/torneios/${p.torneio.slug}`}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Ver torneio
                  </Link>
                  <button
                    type="button"
                    onClick={() => abrirModal(p)}
                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Informar placar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl p-6 space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-500">{modal.torneio.nome} • {modal.categoria.nome}</div>
              <div className="text-lg font-bold text-slate-900">{modal.equipeA.nome || "Equipe A"} x {modal.equipeB.nome || "Equipe B"}</div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm font-semibold text-slate-700">
              <div />
              <div className="text-center">{modal.equipeA.nome || "Equipe A"}</div>
              <div className="text-center">{modal.equipeB.nome || "Equipe B"}</div>
            </div>

            <div className="grid grid-cols-3 gap-2 items-center">
              <div className="text-sm text-slate-600">Set 1</div>
              <input value={s1a} onChange={(e) => setS1a(e.target.value)} type="number" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center" />
              <input value={s1b} onChange={(e) => setS1b(e.target.value)} type="number" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center" />
              <div className="text-sm text-slate-600">Set 2</div>
              <input value={s2a} onChange={(e) => setS2a(e.target.value)} type="number" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center" />
              <input value={s2b} onChange={(e) => setS2b(e.target.value)} type="number" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center" />
              <div className="text-sm text-slate-600">Set 3</div>
              <input value={s3a} onChange={(e) => setS3a(e.target.value)} type="number" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center" />
              <input value={s3b} onChange={(e) => setS3b(e.target.value)} type="number" className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center" />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={salvando}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={enviarPlacar}
                disabled={salvando}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {salvando ? "Enviando..." : "Enviar para arbitragem"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

