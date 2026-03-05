"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, Plus, Save, Trash2, X } from "lucide-react";

type Arena = {
  id: string;
  torneioId: string;
  nome: string;
  criadoEm: string;
};

export default function AdminArenasPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [arenas, setArenas] = useState<Arena[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");

  const podeSalvar = useMemo(() => Boolean(nome.trim()), [nome]);

  async function carregar() {
    const res = await fetch(`/api/v1/torneios/${slug}/arenas`, { cache: "no-store" });
    if (!res.ok) {
      const msg = await res.json().catch(() => null);
      throw new Error(msg?.error || "Falha ao carregar arenas");
    }
    setArenas((await res.json()) as Arena[]);
  }

  useEffect(() => {
    let ativo = true;
    async function run() {
      try {
        setCarregando(true);
        setErro(null);
        await carregar();
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro inesperado");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void run();
    return () => {
      ativo = false;
    };
  }, [slug]);

  async function onSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    try {
      setSalvando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/arenas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao salvar arena");
      }
      setNome("");
      setMostraForm(false);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  async function onExcluir(arenaId: string) {
    const ok = window.confirm("Deseja excluir esta arena?");
    if (!ok) return;
    try {
      setExcluindoId(arenaId);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/arenas/${arenaId}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao excluir arena");
      }
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setExcluindoId(null);
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
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Arenas</h1>
          <p className="text-sm text-slate-600">Cadastro simples de arenas habilitadas no campeonato.</p>
        </div>

        <button
          type="button"
          onClick={() => setMostraForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Nova arena
        </button>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {mostraForm && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <form onSubmit={onSalvar} className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Nova arena</div>
                <div className="text-lg font-bold text-slate-900">Informações</div>
              </div>
              <button type="button" onClick={() => setMostraForm(false)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                <X className="h-4 w-4" />
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nome</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                  placeholder="Ex: Arena Central"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostraForm(false)}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!podeSalvar || salvando}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="h-4 w-4 text-slate-700" />
          Lista
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-3 pr-4 font-medium">Nome</th>
                <th className="py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {arenas.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-10 text-center text-slate-500">
                    Nenhuma arena cadastrada.
                  </td>
                </tr>
              )}
              {arenas
                .slice()
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                    <td className="py-4 pr-4 font-medium text-slate-900">{a.nome}</td>
                    <td className="py-4 text-right">
                      <button
                        type="button"
                        onClick={() => onExcluir(a.id)}
                        disabled={excluindoId === a.id}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {excluindoId === a.id ? "Excluindo…" : "Excluir"}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

