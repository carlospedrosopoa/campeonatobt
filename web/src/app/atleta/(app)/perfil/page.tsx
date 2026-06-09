"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw, User } from "lucide-react";

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
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [me, setMe] = useState<MeuPerfil | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregar(exibirAtualizado = false) {
      try {
        setErro(null);
        setCarregando(true);
        const res = await fetch("/api/v1/atleta/me", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha ao carregar perfil");
        if (!ativo) return;
        const perfil = data as MeuPerfil;
        setMe(perfil);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-orange-500" />
            <div>
              <div className="font-bold text-slate-900">Meu perfil</div>
              <div className="text-xs text-slate-500">Dados basicos sincronizados com o Play na Quadra.</div>
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

          {carregando ? (
            <div className="text-sm text-slate-600">Carregando…</div>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Estes sao apenas os dados basicos espelhados no campeonatoBT.
                Qualquer alteracao de nome, telefone ou foto deve ser feita no seu perfil do Play na Quadra.
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Foto</label>
                {me?.fotoUrl ? (
                  <img
                    src={me.fotoUrl}
                    alt="Foto do perfil"
                    className="h-52 w-full rounded-xl border border-slate-200 object-cover bg-slate-50"
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    Nenhuma foto sincronizada.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nome</label>
                <input
                  value={me?.nome || ""}
                  readOnly
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-600"
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
                  value={me?.telefone || ""}
                  readOnly
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-600"
                  placeholder="Nao informado"
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

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={atualizando}
                  onClick={async () => {
                    try {
                      setErro(null);
                      setAtualizando(true);
                      const res = await fetch("/api/v1/atleta/me", { cache: "no-store" });
                      const data = (await res.json().catch(() => null)) as any;
                      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar dados");
                      setMe(data as MeuPerfil);
                    } catch (e: any) {
                      setErro(e?.message || "Erro ao atualizar dados");
                    } finally {
                      setAtualizando(false);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} />
                  {atualizando ? "Atualizando..." : "Sincronizar com Play"}
                </button>
                <a
                  href="https://torneios.playnaquadra.com.br/atleta/perfil"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir perfil no Play
                </a>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
