"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Flag, Play, Timer } from "lucide-react";
import { Alert, Button } from "@/components/admin/ui";
import { Contador, PlacarForm } from "@/components/admin/operacao/placar-form";
import { agoraServidor, acoesOperacao, contagemAte, emAquecimento, etapaJogo, nomeDupla, tempoDesde, useOperacao, type JogoOperacao } from "@/components/admin/operacao/comum";

/** Tela da quadra (celular de quem fica na quadra): Comecou, cronometro, Terminou e placar. */
export default function QuadraOperacaoPage() {
  const { slug, numero } = useParams<{ slug: string; numero: string }>();
  const n = Number(numero);
  const { estado, erro, recarregar } = useOperacao(slug, null, 4000);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [placarAberto, setPlacarAberto] = useState(false);
  const [agora, setAgora] = useState(agoraServidor);
  const [aquecimento, setAquecimento] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(agoraServidor()), 1000);
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
