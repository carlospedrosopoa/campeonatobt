"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Calendar, ExternalLink, Plus, Search, Settings2 } from "lucide-react";

type TorneioListItem = {
  id: string;
  nome: string;
  slug: string;
  dataInicio: string;
  dataFim: string;
  local: string;
  status: "RASCUNHO" | "ABERTO" | "EM_ANDAMENTO" | "FINALIZADO" | "CANCELADO";
  bannerUrl: string | null;
  esporteNome: string | null;
};

export default function AdminTorneiosPage() {
  const [torneios, setTorneios] = useState<TorneioListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const res = await fetch("/api/v1/torneios?limit=200", { cache: "no-store" });
        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Falha ao carregar torneios");
        }
        const dados = (await res.json()) as TorneioListItem[];
        if (ativo) setTorneios(dados);
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro inesperado");
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const torneiosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return torneios;
    return torneios.filter((t) => {
      const alvo = `${t.nome} ${t.slug} ${t.local} ${t.esporteNome ?? ""} ${t.status}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [torneios, busca]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Torneios</h1>
          <p className="text-sm text-slate-600">Crie, edite e acompanhe os eventos.</p>
        </div>
        <Link
          href="/admin/torneios/novo"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Novo torneio
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, local, esporte, status…"
              className="w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
          </div>
          <div className="text-xs text-slate-500">{torneiosFiltrados.length} torneio(s)</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-3 pr-4 font-medium">Torneio</th>
                <th className="py-3 pr-4 font-medium">Esporte</th>
                <th className="py-3 pr-4 font-medium">Data</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              )}

              {!carregando && erro && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-red-600">
                    {erro}
                  </td>
                </tr>
              )}

              {!carregando && !erro && torneiosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Nenhum torneio encontrado.
                  </td>
                </tr>
              )}

              {!carregando &&
                !erro &&
                torneiosFiltrados.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                    <td className="py-4 pr-4">
                      <Link href={`/admin/torneios/${t.slug}`} className="font-semibold text-slate-900 hover:underline underline-offset-4">
                        {t.nome}
                      </Link>
                      <div className="text-xs text-slate-500">{t.slug}</div>
                      <div className="text-xs text-slate-500">{t.local}</div>
                    </td>
                    <td className="py-4 pr-4 text-slate-700">{t.esporteNome ?? "-"}</td>
                    <td className="py-4 pr-4 text-slate-700">
                      <div className="inline-flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-orange-500" />
                        <span>
                          {new Date(t.dataInicio).toLocaleDateString("pt-BR")}{" "}
                          {t.dataFim ? `até ${new Date(t.dataFim).toLocaleDateString("pt-BR")}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ${
                          t.status === "EM_ANDAMENTO"
                            ? "bg-blue-100 text-blue-700"
                            : t.status === "ABERTO"
                              ? "bg-green-100 text-green-700"
                              : t.status === "FINALIZADO"
                                ? "bg-slate-200 text-slate-700"
                                : t.status === "CANCELADO"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/admin/torneios/${t.slug}/editar`}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Settings2 className="h-4 w-4" />
                          Editar dados
                        </Link>
                        <Link
                          href={`/torneios/${t.slug}`}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Público
                        </Link>
                      </div>
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
