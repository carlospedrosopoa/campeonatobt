"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, RefreshCw, Users } from "lucide-react";

type AtletaInscrito = {
  atletaId: string;
  atletaNome: string;
  atletaEmail: string;
  atletaTelefone: string | null;
  equipeId: string;
  equipeNome: string | null;
  inscricaoId: string;
  inscricaoStatus: string;
};

type CategoriaInscritos = {
  categoriaId: string;
  categoriaNome: string;
  categoriaGenero: string;
  atletas: AtletaInscrito[];
};

type ApiResponse = {
  torneio: { id: string; nome: string; slug: string };
  categorias: CategoriaInscritos[];
};

function normalizeSheetName(value: string) {
  const name = (value || "Categoria").replaceAll(/[\\/?*[\]:]/g, " ").trim();
  return name.length > 31 ? name.slice(0, 31) : name;
}

export default function AdminAtletasInscritosPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/atletas-inscritos`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar inscritos");
      setData(payload as ApiResponse);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar inscritos");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [slug]);

  const totalAtletas = useMemo(() => (data?.categorias || []).reduce((acc, c) => acc + (c.atletas?.length || 0), 0), [data]);

  async function exportarExcel() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const linhasGerais = data.categorias.flatMap((c) =>
      c.atletas.map((a) => ({
        Categoria: c.categoriaNome,
        Genero: c.categoriaGenero,
        Atleta: a.atletaNome,
        Email: a.atletaEmail,
        Telefone: a.atletaTelefone || "",
        Dupla: a.equipeNome || "",
        Status: a.inscricaoStatus,
      }))
    );

    const wsGeral = XLSX.utils.json_to_sheet(linhasGerais);
    XLSX.utils.book_append_sheet(wb, wsGeral, "Inscritos");

    for (const c of data.categorias) {
      const linhas = c.atletas.map((a) => ({
        Atleta: a.atletaNome,
        Email: a.atletaEmail,
        Telefone: a.atletaTelefone || "",
        Dupla: a.equipeNome || "",
        Status: a.inscricaoStatus,
      }));
      const ws = XLSX.utils.json_to_sheet(linhas);
      XLSX.utils.book_append_sheet(wb, ws, normalizeSheetName(c.categoriaNome));
    }

    const fileName = `inscritos-${data.torneio.slug}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Atletas inscritos</h1>
          <p className="text-sm text-slate-600">
            {data?.torneio?.nome || "Torneio"} • {totalAtletas} atleta(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarExcel}
            disabled={!data || carregando || totalAtletas === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>
          <button
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-red-600">{erro}</div>}

      {carregando && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-slate-600">Carregando…</div>
      )}

      {!carregando && data && data.categorias.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center text-slate-600">
          <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          Nenhum atleta inscrito.
        </div>
      )}

      {!carregando && data && data.categorias.length > 0 && (
        <div className="space-y-6">
          {data.categorias.map((c) => (
            <div key={c.categoriaId} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="font-bold text-slate-900">{c.categoriaNome}</div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {c.categoriaGenero} • {c.atletas.length} atleta(s)
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-left text-slate-500">
                      <th className="py-3 px-4 font-medium">Atleta</th>
                      <th className="py-3 px-4 font-medium">Email</th>
                      <th className="py-3 px-4 font-medium">Telefone</th>
                      <th className="py-3 px-4 font-medium">Dupla</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.atletas.map((a) => (
                      <tr key={`${c.categoriaId}:${a.atletaId}:${a.inscricaoId}`} className="border-b border-slate-100">
                        <td className="py-3 px-4 font-semibold text-slate-900">{a.atletaNome}</td>
                        <td className="py-3 px-4 text-slate-700">{a.atletaEmail}</td>
                        <td className="py-3 px-4 text-slate-700">{a.atletaTelefone || "-"}</td>
                        <td className="py-3 px-4 text-slate-700">{a.equipeNome || "-"}</td>
                        <td className="py-3 px-4 text-slate-700">{a.inscricaoStatus}</td>
                      </tr>
                    ))}
                    {c.atletas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Nenhum atleta nesta categoria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

