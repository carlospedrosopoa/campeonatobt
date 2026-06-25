"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";

type Organizer = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: "ORGANIZADOR";
};

type OrganizerEditFormProps = {
  organizerId: string;
};

export default function OrganizerEditForm({ organizerId }: OrganizerEditFormProps) {
  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    senha: "",
  });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const res = await fetch(`/api/v1/admin/organizadores/${organizerId}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as Organizer | { error?: string } | null;
        if (!res.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Falha ao carregar organizer");
        }
        if (!ativo || !data || Array.isArray(data)) return;

        const organizer = data as Organizer;
        setForm({
          nome: organizer.nome,
          email: organizer.email,
          telefone: organizer.telefone || "",
          senha: "",
        });
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
  }, [organizerId]);

  const podeSalvar = useMemo(() => Boolean(form.nome.trim() && form.email.trim()), [form]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!podeSalvar) {
      setErro("Preencha nome e email.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);
      setSucesso(null);

      const res = await fetch(`/api/v1/admin/organizadores/${organizerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          telefone: form.telefone.trim() || null,
          senha: form.senha.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as Organizer | { error?: string } | null;
      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Falha ao salvar organizer");
      }

      const organizer = data as Organizer;
      setForm((prev) => ({
        ...prev,
        nome: organizer.nome,
        email: organizer.email,
        telefone: organizer.telefone || "",
        senha: "",
      }));
      setSucesso("Dados do organizer atualizados com sucesso.");
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/configuracoes/organizadores"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para organizers
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Editar organizer</h1>
          <p className="text-sm text-slate-600">Atualize os dados do organizer e troque a senha apenas quando necessário.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
        {erro ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div> : null}
        {sucesso ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{sucesso}</div>
        ) : null}

        {carregando ? (
          <div className="text-sm text-slate-500">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nome *</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Telefone</label>
              <input
                value={form.telefone}
                onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nova senha</label>
              <input
                type="password"
                value={form.senha}
                onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                placeholder="Deixe em branco para manter a senha atual"
                autoComplete="new-password"
              />
              <div className="text-xs text-slate-500">Somente informe a senha se quiser alterá-la.</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/configuracoes/organizadores"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={carregando || !podeSalvar || salvando}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}
