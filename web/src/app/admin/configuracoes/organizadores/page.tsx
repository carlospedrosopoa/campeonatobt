"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";

type OrganizerListItem = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: "ORGANIZADOR";
  criadoEm: string;
};

export default function AdminOrganizersPage() {
  const [organizers, setOrganizers] = useState<OrganizerListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const res = await fetch("/api/v1/admin/organizadores", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as OrganizerListItem[] | { error?: string } | null;
        if (!res.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Falha ao carregar organizers");
        }
        if (ativo) {
          setOrganizers(Array.isArray(data) ? data : []);
        }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organizers</h1>
          <p className="text-sm text-slate-600">Cadastre e faça manutenção dos organizadores da plataforma.</p>
        </div>
        <Link
          href="/admin/configuracoes/organizadores/novo"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Novo organizer
        </Link>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="text-xs text-slate-500">{organizers.length} organizer(s)</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="py-3 pr-4 font-medium">Nome</th>
                <th className="py-3 pr-4 font-medium">Email</th>
                <th className="py-3 pr-4 font-medium">Telefone</th>
                <th className="py-3 pr-4 font-medium">Criado em</th>
                <th className="py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : null}

              {!carregando && erro ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-red-600">
                    {erro}
                  </td>
                </tr>
              ) : null}

              {!carregando && !erro && organizers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Nenhum organizer cadastrado.
                  </td>
                </tr>
              ) : null}

              {!carregando &&
                !erro &&
                organizers.map((organizer) => (
                  <tr key={organizer.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-slate-900">{organizer.nome}</div>
                    </td>
                    <td className="py-4 pr-4 text-slate-700">{organizer.email}</td>
                    <td className="py-4 pr-4 text-slate-700">{organizer.telefone || "-"}</td>
                    <td className="py-4 pr-4 text-slate-700">{new Date(organizer.criadoEm).toLocaleDateString("pt-BR")}</td>
                    <td className="py-4 text-right">
                      <Link
                        href={`/admin/configuracoes/organizadores/${organizer.id}`}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Link>
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
