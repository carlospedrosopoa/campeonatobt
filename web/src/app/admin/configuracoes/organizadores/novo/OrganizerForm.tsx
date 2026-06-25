"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";

type OrganizerPayload = {
  nome: string;
  email: string;
  senha: string;
  telefone?: string | null;
};

export default function OrganizerForm() {
  const [form, setForm] = useState<OrganizerPayload>({
    nome: "",
    email: "",
    senha: "",
    telefone: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const podeSalvar = Boolean(form.nome.trim() && form.email.trim() && form.senha.trim());

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!podeSalvar) {
      setErro("Preencha nome, email e senha.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);
      setSucesso(null);

      const res = await fetch("/api/v1/admin/organizadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          senha: form.senha,
          telefone: form.telefone?.trim() ? form.telefone.trim() : null,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string; nome?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao cadastrar organizer");
      }

      setSucesso(`Organizer ${data?.nome || "cadastrado"} com sucesso.`);
      setForm({
        nome: "",
        email: "",
        senha: "",
        telefone: "",
      });
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
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Cadastrar organizer</h1>
          <p className="text-sm text-slate-600">Somente admin global pode criar usuários com perfil organizador.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
        {erro ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div> : null}
        {sucesso ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{sucesso}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nome *</label>
            <input
              value={form.nome}
              onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              placeholder="Nome do organizer"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              placeholder="organizer@torneio.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Senha *</label>
            <input
              type="password"
              value={form.senha}
              onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              placeholder="Mínimo de 6 caracteres"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Telefone</label>
            <input
              value={form.telefone || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              placeholder="Opcional"
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/configuracoes/organizadores"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!podeSalvar || salvando}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {salvando ? "Salvando..." : "Cadastrar organizer"}
          </button>
        </div>
      </form>
    </div>
  );
}
