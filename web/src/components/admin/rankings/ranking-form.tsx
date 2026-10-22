"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";
import { Alert, Button } from "@/components/admin/ui";

export type DadosRankingForm = { nome: string; descricao: string; dataInicio: string; dataFim: string; imagemUrl: string };

export const campo = "h-10 w-full rounded-[10px] border border-line bg-white px-3 text-sm font-semibold text-ink";
const rotulo = "text-[13px] font-bold text-ink";

/** Nome, periodo, descricao e imagem do ranking (criar e editar). */
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
    dataInicio: inicial?.dataInicio ?? "",
    dataFim: inicial?.dataFim ?? "",
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
          <input className={campo} value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} placeholder="Ranking 2027" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className={rotulo}>Início</span>
            <input type="date" className={campo} value={dados.dataInicio} onChange={(e) => setDados({ ...dados, dataInicio: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className={rotulo}>Fim</span>
            <input type="date" className={campo} value={dados.dataFim} onChange={(e) => setDados({ ...dados, dataFim: e.target.value })} />
          </label>
        </div>
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

export function formatarPeriodo(inicio: string, fim: string) {
  const f = (d: string) => d.split("-").reverse().join("/");
  return `${f(inicio)} a ${f(fim)}`;
}
