"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

type GzappyConfig = {
  ativo: boolean;
  apiKey: string | null;
  instanceId: string | null;
  whatsappArbitragem: string | null;
};

export default function AdminConfiguracoesPage() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [config, setConfig] = useState<GzappyConfig>({ ativo: false, apiKey: null, instanceId: null, whatsappArbitragem: null });

  useEffect(() => {
    async function load() {
      try {
        setErro(null);
        setCarregando(true);
        const res = await fetch("/api/v1/admin/configuracoes/gzappy", { cache: "no-store" });
        if (!res.ok) throw new Error("Falha ao carregar configurações");
        const data = (await res.json().catch(() => null)) as GzappyConfig | null;
        if (!data) throw new Error("Resposta inválida");
        setConfig(data);
      } catch (e: any) {
        setErro(e?.message || "Erro ao carregar configurações");
      } finally {
        setCarregando(false);
      }
    }
    void load();
  }, []);

  async function salvar() {
    try {
      setErro(null);
      setSalvando(true);
      const res = await fetch("/api/v1/admin/configuracoes/gzappy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar");
      setConfig(data as GzappyConfig);
      alert("Configurações salvas.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
          <p className="text-sm text-slate-600">Integrações e parâmetros da plataforma.</p>
        </div>
        <button
          type="button"
          onClick={salvar}
          disabled={carregando || salvando}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Gzappy (WhatsApp)</h2>
            <p className="text-sm text-slate-600">Configura o envio de mensagens para arbitragem via Gzappy.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={config.ativo}
              onChange={(e) => setConfig((p) => ({ ...p, ativo: e.target.checked }))}
              className="h-4 w-4"
            />
            Ativo
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <div className="text-sm font-medium text-slate-700">JWT Token (API Key)</div>
            <input
              type="password"
              value={config.apiKey || ""}
              onChange={(e) => setConfig((p) => ({ ...p, apiKey: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Bearer token da Gzappy"
              autoComplete="off"
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm font-medium text-slate-700">Instance ID (opcional)</div>
            <input
              type="text"
              value={config.instanceId || ""}
              onChange={(e) => setConfig((p) => ({ ...p, instanceId: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Somente para identificação"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-sm font-medium text-slate-700">WhatsApp da Arbitragem</div>
            <input
              type="text"
              value={config.whatsappArbitragem || ""}
              onChange={(e) => setConfig((p) => ({ ...p, whatsappArbitragem: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Ex: 5551999999999"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

