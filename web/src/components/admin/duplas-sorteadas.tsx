"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Shuffle, Undo2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card } from "@/components/admin/ui";

type Atleta = { usuarioId: string; nome: string; genero: "MASCULINO" | "FEMININO" | null };
type Item = { inscricaoId: string; equipeId: string; atletas: Atleta[] };
type Estado = {
  categoria: { id: string; nome: string; genero: string };
  travada: boolean;
  pendentes: number;
  avulsos: Item[];
  duplas: Item[];
  resumo: { avulsos: number; duplas: number; homens: number; mulheres: number; semGenero: string[] };
  impedimento: string | null;
};

const SIGLA: Record<string, string> = { MASCULINO: "M", FEMININO: "F" };

/** Formacao das duplas de uma categoria de duplas sorteadas: sortear, formar manualmente e desfazer. */
export function DuplasSorteadasPainel({ slug, categoriaId, onAlterou }: { slug: string; categoriaId: string; onAlterou?: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const url = `/api/v1/torneios/${slug}/categorias/${categoriaId}/duplas-sorteadas`;

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar as duplas");
      setEstado(payload as Estado);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    }
  }, [url]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(nome: string, body: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    try {
      setOcupado(nome);
      setErro(null);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Não foi possível concluir a ação");
      setEstado(payload as Estado);
      setSelecionados([]);
      onAlterou?.();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setOcupado(null);
    }
  }

  function alternarSelecao(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));
  }

  if (!estado) {
    return erro ? <Alert>{erro}</Alert> : <Card className="h-28 animate-pulse" />;
  }

  const misto = estado.categoria.genero === "MISTO";
  const { resumo } = estado;
  const nomeAtleta = (a: Atleta) => (
    <span className="inline-flex items-center gap-1.5">
      {misto && a.genero && <span className="rounded bg-sand-2 px-1.5 text-[11px] font-extrabold text-ink-2">{SIGLA[a.genero]}</span>}
      {a.nome}
    </span>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
            <Users className="h-[18px] w-[18px]" /> Formação das duplas
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {resumo.duplas} dupla(s) formada(s) · {resumo.avulsos} atleta(s) sem dupla
            {misto ? ` (${resumo.homens} homens, ${resumo.mulheres} mulheres)` : ""}
            {estado.pendentes > 0 ? ` · ${estado.pendentes} inscrição(ões) pendente(s) não entram no sorteio` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {resumo.duplas > 0 && !estado.travada && (
            <Button
              size="sm"
              variant="ghost"
              disabled={Boolean(ocupado)}
              onClick={() => void acao("desfazer-todas", { acao: "desfazer-todas" }, "Desfazer todas as duplas? Os atletas voltam a ficar sem dupla.")}
              icon={<Undo2 />}
            >
              Desfazer todas
            </Button>
          )}
          <Button
            variant="primary"
            disabled={Boolean(ocupado) || Boolean(estado.impedimento)}
            title={estado.impedimento ?? undefined}
            onClick={() =>
              void acao("sortear", { acao: "sortear" }, `Sortear ${resumo.avulsos / 2} dupla(s) entre os ${resumo.avulsos} atletas sem dupla?`)
            }
            icon={<Shuffle />}
          >
            {ocupado === "sortear" ? "Sorteando…" : "Sortear duplas"}
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {erro && <Alert>{erro}</Alert>}
        {estado.travada ? (
          <Alert tone="info">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4" /> As duplas estão travadas porque os grupos ou jogos já foram gerados.
            </span>
          </Alert>
        ) : estado.impedimento && resumo.avulsos > 0 ? (
          <Alert tone="warning">{estado.impedimento}</Alert>
        ) : null}

        {estado.avulsos.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-ink">Atletas sem dupla</span>
              {!estado.travada && (
                <Button
                  size="sm"
                  disabled={selecionados.length !== 2 || Boolean(ocupado)}
                  onClick={() => void acao("formar", { acao: "formar", inscricaoAId: selecionados[0], inscricaoBId: selecionados[1] })}
                >
                  {ocupado === "formar" ? "Formando…" : `Formar dupla manualmente${selecionados.length ? ` (${selecionados.length}/2)` : ""}`}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {estado.avulsos.map((i) => {
                const a = i.atletas[0];
                const on = selecionados.includes(i.inscricaoId);
                return (
                  <button
                    key={i.inscricaoId}
                    type="button"
                    disabled={estado.travada}
                    aria-pressed={on}
                    onClick={() => alternarSelecao(i.inscricaoId)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-default",
                      on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-[#b5b2aa]",
                    )}
                  >
                    {nomeAtleta(a)}
                  </button>
                );
              })}
            </div>
            {!estado.travada && <p className="text-xs text-muted">Toque em dois atletas para formar a dupla à mão; os demais podem ser sorteados.</p>}
          </div>
        )}

        {estado.duplas.length > 0 && (
          <div className="space-y-2">
            <span className="text-[13px] font-bold text-ink">Duplas formadas</span>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {estado.duplas.map((d, idx) => (
                <div key={d.inscricaoId} className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2">
                  <Badge tone="neutral" className="shrink-0">
                    {idx + 1}
                  </Badge>
                  <div className="min-w-0 flex-1 text-sm font-semibold text-ink">
                    {d.atletas.map((a, i) => (
                      <div key={a.usuarioId} className="truncate">
                        {i > 0 && <span className="text-muted">+ </span>}
                        {nomeAtleta(a)}
                      </div>
                    ))}
                  </div>
                  {!estado.travada && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(ocupado)}
                      onClick={() => void acao("desfazer", { acao: "desfazer", inscricaoId: d.inscricaoId })}
                      aria-label="Desfazer dupla"
                      title="Desfazer dupla"
                      className="w-9 px-0"
                    >
                      <Undo2 />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {estado.avulsos.length === 0 && estado.duplas.length === 0 && (
          <p className="text-sm text-muted">Nenhuma inscrição aprovada ainda.</p>
        )}
      </div>
    </Card>
  );
}
