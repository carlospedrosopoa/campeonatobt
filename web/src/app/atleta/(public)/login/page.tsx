"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

const CREATE_PROFILE_URL = "https://atleta.playnaquadra.com.br";

export default function AtletaLoginPage() {
  const router = useRouter();
  const [next, setNext] = useState("/atleta/torneios");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
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
    setCode(null);
    setLink(null);

    if (!email.trim() || !password) {
      setErro("Informe email e senha.");
      return;
    }

    try {
      setCarregando(true);
      const res = await fetch("/api/v1/auth/sso/carlaobtonline/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });

      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setErro(payload?.error || "Falha ao entrar");
        setCode(payload?.code || null);
        setLink(payload?.url || null);
        return;
      }

      router.push(payload?.next || next);
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
              <h1 className="text-2xl font-bold text-slate-900">Área do Atleta</h1>
              <p className="text-sm text-slate-600">Entre com seu login do App do Atleta.</p>
            </div>

            {erro && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
                <div>{erro}</div>
                {code === "ATLETA_SEM_PERFIL" && (
                  <div className="text-sm text-red-700">
                    <a href={link || CREATE_PROFILE_URL} target="_blank" rel="noreferrer" className="underline font-medium">
                      Criar perfil de atleta
                    </a>
                  </div>
                )}
                {code === "PLAY_CREDENCIAIS_INVALIDAS" && (
                  <div className="text-sm text-red-700">
                    Se você estiver tentando entrar com um usuário de admin/arena/professor, use uma conta de atleta.
                  </div>
                )}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="seu@email.com"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Senha</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <Link href="/atleta/sso/iniciar" className="text-slate-600 hover:text-slate-900">
                Entrar com App
              </Link>
              <a href={CREATE_PROFILE_URL} target="_blank" rel="noreferrer" className="text-slate-600 hover:text-slate-900">
                Criar perfil
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

