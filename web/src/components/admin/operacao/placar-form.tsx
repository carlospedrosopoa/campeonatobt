"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/admin/ui";
import { nomeDupla, type JogoOperacao } from "@/components/admin/operacao/comum";

/** Contador e formulario de placar usados na tela da quadra e na mesa de controle. */

export function Contador({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
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

export function PlacarForm({
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
