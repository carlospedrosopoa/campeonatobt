"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [next, setNext] = useState("/admin");

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const n = sp.get("next");
      if (n) setNext(n);
    } catch {}
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!email.trim() || !senha) {
      setErro("Informe email e senha.");
      return;
    }

    try {
      setCarregando(true);
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao entrar");
      }

      router.push(next);
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto px-4 py-10">
        <div className="mx-auto max-w-md">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">Login</h1>
              <p className="text-sm text-slate-600">Acesse sua conta para gerenciar torneios.</p>
            </div>

            {erro && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="admin@torneio.com"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Senha</label>
                <input
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  type="password"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                {carregando ? "Entrando…" : "Entrar"}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between text-sm">
              <Link href="/" className="text-slate-600 hover:text-slate-900">
                Voltar ao site
              </Link>
              <span className="text-slate-400">Sem cadastro ainda</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
