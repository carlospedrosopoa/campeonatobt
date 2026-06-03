"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, User } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";

type MeuPerfil = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: string;
  playnaquadraAtletaId: string | null;
  fotoUrl: string | null;
};

export default function AtletaPerfilPage() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [me, setMe] = useState<MeuPerfil | null>(null);

  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    fotoUrl: "",
  });

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setErro(null);
        setOk(null);
        setCarregando(true);
        const res = await fetch("/api/v1/atleta/me", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha ao carregar perfil");
        if (!ativo) return;
        const perfil = data as MeuPerfil;
        setMe(perfil);
        setForm({
          nome: String(perfil.nome || ""),
          telefone: String(perfil.telefone || ""),
          fotoUrl: String(perfil.fotoUrl || ""),
        });
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro ao carregar perfil");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const podeSalvar = useMemo(() => {
    return Boolean(form.nome.trim());
  }, [form.nome]);

  async function salvar() {
    try {
      setErro(null);
      setOk(null);
      if (!podeSalvar) {
        setErro("Informe seu nome.");
        return;
      }
      setSalvando(true);
      const res = await fetch("/api/v1/atleta/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          telefone: form.telefone.trim() || null,
          fotoUrl: form.fotoUrl.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar perfil");
      setMe(data as MeuPerfil);
      setOk("Perfil atualizado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar perfil");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-orange-500" />
            <div>
              <div className="font-bold text-slate-900">Meu perfil</div>
              <div className="text-xs text-slate-500">Atualize seus dados de atleta.</div>
            </div>
          </div>
          <Link href="/atleta/torneios" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-xl bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
          {ok && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div>}

          {carregando ? (
            <div className="text-sm text-slate-600">Carregando…</div>
          ) : (
            <>
              <div className="space-y-2">
                <ImageUpload
                  label="Foto"
                  value={form.fotoUrl}
                  onChange={(url) => setForm((p) => ({ ...p, fotoUrl: url || "" }))}
                  folder="usuarios/fotos"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nome *</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                  placeholder="Seu nome"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input
                  value={me?.email || ""}
                  readOnly
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Telefone</label>
                <input
                  value={form.telefone}
                  onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                  placeholder="(DDD) 99999-9999"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">ID Play na Quadra</label>
                <input
                  value={me?.playnaquadraAtletaId || ""}
                  readOnly
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <a
                  href="https://atleta.playnaquadra.com.br"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Abrir Play na Quadra
                </a>
                <button
                  type="button"
                  disabled={!podeSalvar || salvando}
                  onClick={() => void salvar()}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

