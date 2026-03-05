"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Edit, Plus, Trash2 } from "lucide-react";

type Apoiador = {
  id: string;
  nome: string;
  logoUrl?: string;
  slogan?: string;
};

export default function AdminApoiadoresPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [apoiadores, setApoiadores] = useState<Apoiador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  async function carregar() {
    const res = await fetch(`/api/v1/torneios/${slug}/apoiadores`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Falha ao carregar apoiadores");
    }
    setApoiadores(await res.json());
  }

  useEffect(() => {
    let ativo = true;
    async function run() {
      try {
        setCarregando(true);
        await carregar();
      } catch (e: any) {
        if (ativo) setErro(e?.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void run();
    return () => { ativo = false; };
  }, [slug]);

  async function onExcluir(id: string) {
    if (!confirm("Deseja excluir este apoiador?")) return;
    try {
      setExcluindoId(id);
      const res = await fetch(`/api/v1/torneios/${slug}/apoiadores/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir");
      await carregar();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setExcluindoId(null);
    }
  }

  if (carregando) return <div className="text-sm text-slate-600">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Apoiadores</h1>
          <p className="text-sm text-slate-600">Gerencie os parceiros e patrocinadores do evento.</p>
        </div>
        <Link
          href={`/admin/torneios/${slug}/apoiadores/novo`}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Novo apoiador
        </Link>
      </div>

      {erro && <div className="text-red-600">{erro}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="py-3 px-4 text-left font-medium text-slate-600">Logo</th>
              <th className="py-3 px-4 text-left font-medium text-slate-600">Nome</th>
              <th className="py-3 px-4 text-left font-medium text-slate-600">Slogan</th>
              <th className="py-3 px-4 text-right font-medium text-slate-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {apoiadores.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">Nenhum apoiador cadastrado.</td>
              </tr>
            )}
            {apoiadores.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/50">
                <td className="py-3 px-4">
                  {a.logoUrl ? (
                    <img src={a.logoUrl} alt={a.nome} className="h-10 w-10 object-contain rounded-md border border-slate-200" />
                  ) : (
                    <div className="h-10 w-10 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center text-xs text-slate-400">Sem logo</div>
                  )}
                </td>
                <td className="py-3 px-4 font-medium text-slate-900">{a.nome}</td>
                <td className="py-3 px-4 text-slate-600">{a.slogan}</td>
                <td className="py-3 px-4 text-right space-x-2">
                  <Link
                    href={`/admin/torneios/${slug}/apoiadores/${a.id}/editar`}
                    className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                  >
                    <Edit className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => onExcluir(a.id)}
                    disabled={excluindoId === a.id}
                    className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
