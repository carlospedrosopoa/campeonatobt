"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";
import { Alert, Button } from "@/components/admin/ui";

export type DadosRankingForm = { nome: string; descricao: string; janelaMeses: string; imagemUrl: string };

export const campo = "h-10 w-full rounded-[10px] border border-line bg-white px-3 text-sm font-semibold text-ink";
const rotulo = "text-[13px] font-bold text-ink";

/** Nome, janela do ranking de entrada, descricao e imagem (criar e editar). */
export function RankingForm({
  inicial,
  textoBotao,
  onSalvar,
  onCancelar,
}: {
  inicial?: Partial<DadosRankingForm>;
  textoBotao: string;
  onSalvar: (dados: DadosRankingForm) => Promise<void>;
  onCancelar?: () => void;
}) {
  const [dados, setDados] = useState<DadosRankingForm>({
    nome: inicial?.nome ?? "",
    descricao: inicial?.descricao ?? "",
    janelaMeses: inicial?.janelaMeses ?? "12",
    imagemUrl: inicial?.imagemUrl ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <form
      className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
          await onSalvar(dados);
        } catch (err: any) {
          setErro(err?.message || "Não foi possível salvar");
        } finally {
          setSalvando(false);
        }
      }}
    >
      <div className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <label className="block space-y-1">
          <span className={rotulo}>Nome</span>
          <input className={campo} value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} placeholder="Liga Master" />
        </label>
        <label className="block space-y-1">
          <span className={rotulo}>Ranking de entrada: pontos dos últimos</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={120}
              className={`${campo} w-24`}
              value={dados.janelaMeses}
              onChange={(e) => setDados({ ...dados, janelaMeses: e.target.value })}
            />
            <span className="text-sm font-semibold text-ink-2">meses</span>
          </span>
          <span className="block text-xs text-muted">O ranking permanente soma todos os pontos, sem prazo.</span>
        </label>
        <label className="block space-y-1">
          <span className={rotulo}>Descrição (opcional)</span>
          <textarea
            className="min-h-20 w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-ink"
            value={dados.descricao}
            onChange={(e) => setDados({ ...dados, descricao: e.target.value })}
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? "Salvando…" : textoBotao}
          </Button>
          {onCancelar && (
            <Button variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
      <ImageUpload label="Imagem" folder="rankings" value={dados.imagemUrl} onChange={(url) => setDados({ ...dados, imagemUrl: url })} />
    </form>
  );
}

export function rotuloJanela(meses: number) {
  return meses === 1 ? "último mês" : `últimos ${meses} meses`;
}

export function formatarData(d: string) {
  return d.split("-").reverse().join("/");
}
