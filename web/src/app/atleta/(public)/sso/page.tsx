"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AtletaSsoPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        setErro(null);
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const sp = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const token = sp.get("token") || "";
        if (!token) {
          setErro("Token ausente.");
          return;
        }

        const res = await fetch("/api/v1/auth/sso/carlaobtonline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha no SSO");

        window.history.replaceState({}, document.title, "/atleta/torneios");
        router.replace("/atleta/torneios");
        router.refresh();
      } catch (e: any) {
        setErro(e?.message || "Erro ao autenticar");
      }
    }
    void run();
  }, [router]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto px-4 py-10">
        <div className="mx-auto max-w-md">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-3">
            <div className="text-lg font-bold text-slate-900">Entrando…</div>
            <div className="text-sm text-slate-600">Conectando com o App do Atleta.</div>
            {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

