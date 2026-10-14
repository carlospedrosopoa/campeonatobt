"use client";

import { useEffect, useState } from "react";
import { Swords, X } from "lucide-react";
import type { ConfrontoPartida, ResultadoConfronto } from "@/services/confrontos.service";

function nomeCurto(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return p.length <= 1 ? p[0] ?? "" : `${p[0]} ${p[p.length - 1]}`;
}

function avatarUrl(a: { nome: string; fotoUrl: string | null }) {
  return a.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=random&color=fff`;
}

function dataCurta(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
}

const Placar: React.FC<{ r: ResultadoConfronto; grande?: boolean }> = ({ r, grande }) => (
  <span className={`inline-flex items-center gap-2 font-extrabold tabular-nums ${grande ? "text-4xl" : "text-lg"}`}>
    <span className={r.vitorias > r.derrotas ? "text-emerald-600" : "text-slate-900"}>{r.vitorias}</span>
    <span className={`font-semibold text-slate-300 ${grande ? "text-2xl" : "text-sm"}`}>x</span>
    <span className={r.derrotas > r.vitorias ? "text-emerald-600" : "text-slate-900"}>{r.derrotas}</span>
  </span>
);

const Forma: React.FC<{ resultados: ("V" | "D")[] }> = ({ resultados }) =>
  resultados.length === 0 ? (
    <span className="text-xs text-slate-400">sem jogos</span>
  ) : (
    <span className="flex gap-1">
      {resultados.map((r, i) => (
        <span
          key={i}
          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-extrabold ${
            r === "V" ? "bg-emerald-500 text-white" : "bg-rose-100 text-rose-600"
          }`}
        >
          {r}
        </span>
      ))}
    </span>
  );

const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="border-t border-slate-100 px-5 py-4">
    <h4 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-slate-500">{titulo}</h4>
    {children}
  </section>
);

/** Painel com o historico de confrontos de um jogo: duplas, atleta x atleta, parceria e momento. */
export function ConfrontoJogo({ url, onFechar }: { url: string; onFechar: () => void }) {
  const [dados, setDados] = useState<ConfrontoPartida | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch(url)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || "Não foi possível carregar o confronto");
        if (ativo) setDados(d);
      })
      .catch((e) => ativo && setErro(e?.message || "Erro inesperado"));
    return () => {
      ativo = false;
    };
  }, [url]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  const nomes = new Map([...(dados?.duplaA ?? []), ...(dados?.duplaB ?? [])].map((a) => [a.id, nomeCurto(a.nome)]));
  const nomeDupla = (lista: { nome: string }[]) => lista.map((a) => nomeCurto(a.nome)).join(" / ");
  const paresComJogos = dados?.atletas.filter((p) => p.resultado.vitorias + p.resultado.derrotas > 0) ?? [];
  const duplasJogos = dados ? dados.duplas.vitorias + dados.duplas.derrotas : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confronto"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <Swords className="h-5 w-5 text-indigo-600" /> Confronto
          </h3>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {erro ? (
            <p className="px-5 pb-6 text-sm text-rose-600">{erro}</p>
          ) : !dados ? (
            <div className="space-y-3 px-5 pb-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <>
              {/* duplas frente a frente */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pb-5">
                {[dados.duplaA, dados.duplaB].map((dupla, lado) => (
                  <div key={lado} className={`flex flex-col items-center gap-2 text-center ${lado === 1 ? "order-3" : ""}`}>
                    <div className="flex -space-x-3">
                      {dupla.map((a) => (
                        <img key={a.id} src={avatarUrl(a)} alt={a.nome} className="h-12 w-12 rounded-full bg-slate-100 object-cover ring-2 ring-white" />
                      ))}
                    </div>
                    <div className="text-xs font-bold leading-tight text-slate-800">
                      {dupla.map((a) => (
                        <div key={a.id}>{nomeCurto(a.nome)}</div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="order-2 flex flex-col items-center">
                  {duplasJogos > 0 ? (
                    <>
                      <Placar r={dados.duplas} grande />
                      <span className="mt-1 text-[11px] font-semibold text-slate-400">
                        {duplasJogos} {duplasJogos === 1 ? "jogo" : "jogos"}
                      </span>
                    </>
                  ) : (
                    <span className="max-w-24 text-center text-xs font-bold text-indigo-600">Primeiro confronto</span>
                  )}
                </div>
              </div>

              {duplasJogos > 0 && (
                <Secao titulo="Últimos encontros das duplas">
                  <ul className="space-y-2">
                    {dados.duplas.jogos.map((j, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm">
                        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-extrabold ${j.venceu ? "bg-emerald-500 text-white" : "bg-rose-100 text-rose-600"}`}>
                          {j.venceu ? "V" : "D"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-600">
                          {j.torneioNome} · {j.categoriaNome}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-900">{j.placar}</span>
                        <span className="shrink-0 text-xs text-slate-400">{dataCurta(j.data)}</span>
                      </li>
                    ))}
                  </ul>
                </Secao>
              )}

              <Secao titulo="Atleta contra atleta">
                {paresComJogos.length === 0 ? (
                  <p className="text-sm text-slate-500">Esses atletas ainda não se enfrentaram em jogos registrados.</p>
                ) : (
                  <ul className="space-y-2">
                    {paresComJogos.map((p) => (
                      <li key={`${p.atletaA}-${p.atletaB}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{nomes.get(p.atletaA)}</span>
                        <Placar r={p.resultado} />
                        <span className="truncate text-right text-sm font-semibold text-slate-800">{nomes.get(p.atletaB)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-slate-400">Conta qualquer jogo em que estiveram em lados opostos, com qualquer parceiro.</p>
              </Secao>

              <Secao titulo="Parceria">
                <div className="space-y-2">
                  {(
                    [
                      [dados.duplaA, dados.juntos.A],
                      [dados.duplaB, dados.juntos.B],
                    ] as const
                  ).map(([dupla, r], i) => {
                    const total = r.vitorias + r.derrotas;
                    return (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-semibold text-slate-800">{nomeDupla(dupla)}</span>
                        <span className="shrink-0 text-slate-500">
                          {total === 0 ? "primeira vez juntos" : `${total} ${total === 1 ? "jogo" : "jogos"} · ${r.vitorias}V ${r.derrotas}D`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Secao>

              <Secao titulo="Últimos 5 jogos nos torneios da Plataforma Play Na Quadra">
                <div className="space-y-2">
                  {[...dados.duplaA, ...dados.duplaB].map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-semibold text-slate-800">{nomeCurto(a.nome)}</span>
                      <Forma resultados={dados.forma[a.id] ?? []} />
                    </div>
                  ))}
                </div>
              </Secao>

              <p className="px-5 pb-5 text-[11px] text-slate-400">Considera jogos encerrados nas competições do Play na Quadra. W.O. conta como resultado, sem somar sets e games.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
