"use client";

import { useState } from "react";

type Props = {
  submissaoId: string;
  token: string;
  titulo: string;
  descricao: string;
  detalhes: string[];
};

export default function ConfirmarPlacarClient(props: Props) {
  const [status, setStatus] = useState<"idle" | "confirmando" | "cancelando" | "ok" | "erro">("idle");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(acao: "CONFIRMAR" | "CANCELAR") {
    try {
      setErro(null);
      setStatus(acao === "CONFIRMAR" ? "confirmando" : "cancelando");
      const res = await fetch(`/api/public/placar-submissoes/${props.submissaoId}/acao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: props.token, acao }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao processar");
      setStatus("ok");
    } catch (e: any) {
      setErro(e?.message || "Erro");
      setStatus("erro");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-xl px-4">
        <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{props.titulo}</h1>
            <p className="text-sm text-slate-600">{props.descricao}</p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
            {props.detalhes.map((d, idx) => (
              <div key={idx}>{d}</div>
            ))}
          </div>

          {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

          {status === "ok" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Ação concluída com sucesso.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => enviar("CANCELAR")}
                disabled={status !== "idle" && status !== "erro"}
                className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {status === "cancelando" ? "Cancelando..." : "Cancelar lançamento"}
              </button>
              <button
                type="button"
                onClick={() => enviar("CONFIRMAR")}
                disabled={status !== "idle" && status !== "erro"}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {status === "confirmando" ? "Confirmando..." : "Confirmar placar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

