"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Flag, Minus, Play, Plus, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Button } from "@/components/admin/ui";
import { acoesOperacao, contagemAte, emAquecimento, etapaJogo, nomeDupla, tempoDesde, useOperacao, type JogoOperacao } from "@/components/admin/operacao/comum";

/** Tela da quadra (celular de quem fica na quadra): Comecou, cronometro, Terminou e placar. */
export default function QuadraOperacaoPage() {
  const { slug, numero } = useParams<{ slug: string; numero: string }>();
  const n = Number(numero);
  const { estado, erro, recarregar } = useOperacao(slug, null, 4000);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [placarAberto, setPlacarAberto] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const [aquecimento, setAquecimento] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const quadra = estado?.quadras.find((q) => q.numero === n) ?? null;
  const jogo = quadra?.jogo ?? null;
  // aquecimento: comeca com o padrao da mesa de controle e pode ser ajustado antes do "Comecou"
  const minutosAquecimento = aquecimento ?? estado?.torneio.aquecimentoMin ?? 5;
  const aquecendo = jogo ? emAquecimento(jogo, agora) : false;

  useEffect(() => {
    if (!jogo || jogo.status !== "EM_ANDAMENTO") setPlacarAberto(false);
  }, [jogo]);

  async function executar(fn: () => Promise<unknown>) {
    try {
      setOcupado(true);
      setFalha(null);
      await fn();
      await recarregar();
      return true;
    } catch (e: any) {
      setFalha(e?.message || "Erro inesperado");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-paper px-4 py-5">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold text-ink">Quadra {n}</h1>
        <span className="truncate text-xs font-semibold text-muted">{estado?.torneio.nome}</span>
      </header>

      {(erro || falha) && <Alert>{falha || erro}</Alert>}

      {!estado ? (
        <div className="h-48 animate-pulse rounded-2xl bg-sand-2" />
      ) : !jogo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <Timer className="h-8 w-8 text-muted" />
          <p className="text-lg font-bold text-ink">Quadra livre</p>
          <p className="text-sm text-muted">Aguarde a mesa de controle chamar o próximo jogo. Esta tela atualiza sozinha.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-muted">
              {jogo.categoriaNome} · {etapaJogo(jogo)}
            </div>
            <div className="space-y-1 text-xl font-extrabold leading-tight text-ink">
              <div>{nomeDupla(jogo.equipeA)}</div>
              <div className="text-sm font-semibold text-muted">contra</div>
              <div>{nomeDupla(jogo.equipeB)}</div>
            </div>
            <div className="mt-4 text-sm font-semibold text-muted">
              {jogo.status === "EM_ANDAMENTO" ? (
                aquecendo ? (
                  <span className="block text-center">
                    <span className="block text-xs font-bold uppercase tracking-[0.08em] text-muted">Aquecimento</span>
                    <span className="block font-display text-6xl font-bold tabular-nums text-ocean-strong">{contagemAte(jogo.aquecimentoAte, agora)}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-ocean-strong">
                    <Timer className="h-4 w-4" /> Em jogo há {tempoDesde(jogo.aquecimentoAte ?? jogo.iniciadoEm, agora)}
                  </span>
                )
              ) : (
                <span>Chamado há {tempoDesde(jogo.chamadoEm, agora)} · {jogo.presentes}/{jogo.total} presentes</span>
              )}
            </div>
          </div>

          {jogo.status === "AGENDADA" && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-3">
                <span className="text-sm font-bold text-ink">Aquecimento</span>
                <span className="flex items-center gap-2">
                  <Contador valor={minutosAquecimento} onChange={(v) => setAquecimento(Math.min(30, v))} />
                  <span className="text-sm font-semibold text-muted">min</span>
                </span>
              </div>
              <Button
                variant="dark"
                className="h-16 text-lg"
                icon={<Play />}
                disabled={ocupado}
                onClick={() => executar(() => acoesOperacao.iniciar(slug, jogo.id, minutosAquecimento))}
              >
                Começou
              </Button>
            </>
          )}

          {jogo.status === "EM_ANDAMENTO" &&
            !aquecendo &&
            (placarAberto ? (
              <PlacarForm
                jogo={jogo}
                ocupado={ocupado}
                onCancelar={() => setPlacarAberto(false)}
                onSalvar={async (sets) => {
                  const ok = await executar(() => acoesOperacao.lancarPlacar(slug, jogo, sets));
                  if (ok) setPlacarAberto(false);
                }}
              />
            ) : (
              <Button variant="primary" className="h-16 text-lg" icon={<Flag />} disabled={ocupado} onClick={() => setPlacarAberto(true)}>
                Terminou · lançar placar
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

function Contador({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  const btn = "flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-white text-ink active:bg-sand-2";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(Math.max(0, valor - 1))} aria-label="Diminuir">
        <Minus className="h-5 w-5" />
      </button>
      <span className="w-10 text-center font-display text-3xl font-bold tabular-nums text-ink">{valor}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(99, valor + 1))} aria-label="Aumentar">
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

function PlacarForm({
  jogo,
  ocupado,
  onSalvar,
  onCancelar,
}: {
  jogo: JogoOperacao;
  ocupado: boolean;
  onSalvar: (sets: { a: number; b: number }[]) => void;
  onCancelar: () => void;
}) {
  const [sets, setSets] = useState([{ a: 0, b: 0 }]);
  const mudar = (i: number, lado: "a" | "b", v: number) => setSets((s) => s.map((x, j) => (j === i ? { ...x, [lado]: v } : x)));
  const resumo = sets.map((s) => `${s.a}-${s.b}`).join(" · ");

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-base font-extrabold text-ink">Placar</h2>
      {sets.map((s, i) => (
        <div key={i} className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{i + 1}º set</div>
          {(["a", "b"] as const).map((lado) => (
            <div key={lado} className="flex items-center justify-between gap-3">
              <span className={cn("min-w-0 flex-1 truncate text-sm font-bold", s[lado] > s[lado === "a" ? "b" : "a"] ? "text-ink" : "text-muted")}>
                {nomeDupla(lado === "a" ? jogo.equipeA : jogo.equipeB)}
              </span>
              <Contador valor={s[lado]} onChange={(v) => mudar(i, lado, v)} />
            </div>
          ))}
        </div>
      ))}
      <div className="flex gap-2">
        {sets.length < 3 && (
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setSets((s) => [...s, { a: 0, b: 0 }])}>
            Adicionar set
          </Button>
        )}
        {sets.length > 1 && (
          <Button size="sm" variant="ghost" icon={<Minus />} onClick={() => setSets((s) => s.slice(0, -1))}>
            Remover set
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancelar} disabled={ocupado}>
          Voltar
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={ocupado || sets.every((s) => s.a === 0 && s.b === 0)}
          onClick={() => {
            if (window.confirm(`Confirmar o placar ${resumo}? O jogo será encerrado.`)) onSalvar(sets);
          }}
        >
          {ocupado ? "Salvando…" : "Encerrar jogo"}
        </Button>
      </div>
    </div>
  );
}
