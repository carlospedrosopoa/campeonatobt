"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Medal, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/admin/ui";
import { RankingForm, campo, formatarPeriodo } from "@/components/admin/rankings/ranking-form";

type Ranking = { id: string; nome: string; descricao: string | null; dataInicio: string; dataFim: string; imagemUrl: string | null };
type Linha = { usuarioId: string; nome: string; fotoUrl: string | null; pontos: number; posicao: number };
type Lancamento = {
  id: string;
  usuarioId: string;
  atleta: string;
  tipo: "INICIAL" | "MANUAL" | "TORNEIO";
  pontos: number;
  observacao: string | null;
  torneio: string | null;
  criadoEm: string;
};
type AtletaPlay = { id: string; nome: string; email: string; telefone?: string | null; fotoUrl?: string | null };

const TIPO: Record<Lancamento["tipo"], { label: string; tone: "info" | "neutral" | "signal" }> = {
  INICIAL: { label: "Inicial", tone: "info" },
  MANUAL: { label: "Manual", tone: "neutral" },
  TORNEIO: { label: "Torneio", tone: "signal" },
};

function Avatar({ nome, fotoUrl }: { nome: string; fotoUrl: string | null }) {
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand-2 text-xs font-extrabold text-ink-2">
      {nome.slice(0, 1).toUpperCase()}
    </div>
  );
}

function sinal(p: number) {
  return p > 0 ? `+${p}` : String(p);
}

export default function RankingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [dados, setDados] = useState<{ ranking: Ranking; classificacao: Linha[]; lancamentos: Lancamento[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [lancandoPara, setLancandoPara] = useState<Linha | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/rankings/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErro(data?.error || "Não foi possível carregar o ranking");
      return;
    }
    setDados(data);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(body: Record<string, unknown>) {
    const res = await fetch(`/api/v1/admin/rankings/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Não foi possível salvar");
    await carregar();
  }

  async function acaoComAviso(body: Record<string, unknown>) {
    setErro(null);
    try {
      await acao(body);
    } catch (e: any) {
      setErro(e.message);
    }
  }

  if (!dados) {
    return <div className="mx-auto max-w-5xl">{erro ? <Alert>{erro}</Alert> : <p className="text-sm text-muted">Carregando…</p>}</div>;
  }

  const { ranking, classificacao, lancamentos } = dados;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Ranking"
        title={ranking.nome}
        description={
          <>
            {formatarPeriodo(ranking.dataInicio, ranking.dataFim)}
            {ranking.descricao && <span className="block text-muted">{ranking.descricao}</span>}
          </>
        }
        actions={
          !editando && (
            <>
              <Button icon={<Pencil />} onClick={() => setEditando(true)}>
                Editar
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 />}
                onClick={async () => {
                  if (!confirm(`Excluir o ranking "${ranking.nome}" com todos os atletas e pontos?`)) return;
                  const res = await fetch(`/api/v1/admin/rankings/${id}`, { method: "DELETE" });
                  if (res.ok) router.push("/admin/rankings");
                  else setErro((await res.json().catch(() => null))?.error || "Não foi possível excluir");
                }}
              >
                Excluir
              </Button>
            </>
          )
        }
      />

      {erro && <Alert>{erro}</Alert>}

      {editando ? (
        <Card className="p-4 sm:p-5">
          <RankingForm
            inicial={{ ...ranking, descricao: ranking.descricao ?? "", imagemUrl: ranking.imagemUrl ?? "" }}
            textoBotao="Salvar"
            onCancelar={() => setEditando(false)}
            onSalvar={async (d) => {
              const res = await fetch(`/api/v1/admin/rankings/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(d),
              });
              const data = await res.json().catch(() => null);
              if (!res.ok) throw new Error(data?.error || "Não foi possível salvar");
              setEditando(false);
              await carregar();
            }}
          />
        </Card>
      ) : (
        ranking.imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ranking.imagemUrl} alt="" className="max-h-56 w-full rounded-[14px] object-cover" />
        )
      )}

      <Card>
        <CardHeader
          title="Classificação"
          description={`${classificacao.length} ${classificacao.length === 1 ? "atleta" : "atletas"}`}
          actions={
            !adicionando && (
              <Button variant="primary" icon={<UserPlus />} onClick={() => setAdicionando(true)}>
                Adicionar atleta
              </Button>
            )
          }
        />
        {adicionando && <AdicionarAtleta onCancelar={() => setAdicionando(false)} onAdicionar={(b) => acao({ acao: "adicionarAtleta", ...b })} />}
        {classificacao.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Medal />} title="Nenhum atleta no ranking" description="Adicione os atletas e, se for o caso, a pontuação inicial de cada um." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {classificacao.map((l) => (
              <li key={l.usuarioId} className="px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="w-7 text-right font-display text-lg font-bold text-ink-2">{l.posicao}º</span>
                  <Avatar nome={l.nome} fotoUrl={l.fotoUrl} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{l.nome}</span>
                  <span className="font-display text-xl font-bold text-ink">{l.pontos}</span>
                  <Button size="sm" icon={<Plus />} onClick={() => setLancandoPara(lancandoPara?.usuarioId === l.usuarioId ? null : l)}>
                    <span className="hidden sm:inline">Pontos</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remover ${l.nome}`}
                    icon={<X />}
                    onClick={() => {
                      if (confirm(`Remover ${l.nome} do ranking? Os pontos lançados para ele também saem.`)) {
                        void acaoComAviso({ acao: "removerAtleta", usuarioId: l.usuarioId });
                      }
                    }}
                  />
                </div>
                {lancandoPara?.usuarioId === l.usuarioId && (
                  <LancarPontos
                    onCancelar={() => setLancandoPara(null)}
                    onLancar={async (b) => {
                      await acao({ acao: "lancar", usuarioId: l.usuarioId, ...b });
                      setLancandoPara(null);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Lançamentos" description="Extrato de pontos: inicial, manuais e, depois, os gerados pelos torneios." />
        {lancamentos.length === 0 ? (
          <p className="p-4 text-sm text-muted sm:px-5">Nenhum lançamento ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lancamentos.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <span className={cn("w-12 shrink-0 text-right font-display text-lg font-bold", l.pontos < 0 ? "text-red-700" : "text-[#17663f]")}>
                  {sinal(l.pontos)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink">{l.atleta}</span>
                    <Badge tone={TIPO[l.tipo].tone}>{TIPO[l.tipo].label}</Badge>
                  </div>
                  {(l.observacao || l.torneio) && <p className="text-[13px] text-ink-2">{l.observacao || l.torneio}</p>}
                  <p className="text-xs text-muted">{new Date(l.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Excluir lançamento"
                  icon={<Trash2 />}
                  onClick={() => {
                    if (confirm(`Excluir o lançamento de ${sinal(l.pontos)} para ${l.atleta}?`)) {
                      void acaoComAviso({ acao: "excluirLancamento", lancamentoId: l.id });
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AdicionarAtleta({
  onAdicionar,
  onCancelar,
}: {
  onAdicionar: (b: { atleta: AtletaPlay; pontosIniciais: string; observacao: string }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<AtletaPlay[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [atleta, setAtleta] = useState<AtletaPlay | null>(null);
  const [pontos, setPontos] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const q = busca.trim();
    if (atleta || q.length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`/api/v1/admin/playnaquadra/atletas?q=${encodeURIComponent(q)}&limite=8`, { cache: "no-store" });
        if (res.ok) setResultados((await res.json()).atletas || []);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, atleta]);

  return (
    <form
      className="space-y-3 border-b border-line bg-sand p-4 sm:px-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!atleta) {
          setErro("Busque e selecione o atleta");
          return;
        }
        setSalvando(true);
        setErro(null);
        try {
          await onAdicionar({ atleta, pontosIniciais: pontos, observacao });
          // deixa o formulario aberto para incluir o proximo atleta
          setAtleta(null);
          setBusca("");
          setPontos("");
          setObservacao("");
        } catch (err: any) {
          setErro(err.message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      {erro && <Alert>{erro}</Alert>}
      {atleta ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2">
          <Avatar nome={atleta.nome} fotoUrl={atleta.fotoUrl ?? null} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-ink">{atleta.nome}</div>
            <div className="truncate text-xs text-muted">{atleta.email}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setAtleta(null)}>
            Trocar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <input
            autoFocus
            className={campo}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar atleta no Play na Quadra (nome ou e-mail)"
          />
          {(resultados.length > 0 || buscando) && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[10px] border border-line bg-white shadow-lg">
              {buscando && resultados.length === 0 && <p className="px-3 py-2 text-sm text-muted">Buscando…</p>}
              {resultados.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-sand"
                  onClick={() => setAtleta(a)}
                >
                  <Avatar nome={a.nome} fotoUrl={a.fotoUrl ?? null} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{a.nome}</span>
                    <span className="block truncate text-xs text-muted">{a.email}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
        <label className="block space-y-1">
          <span className="text-[13px] font-bold text-ink">Pontuação inicial</span>
          <input type="number" step={1} className={campo} value={pontos} onChange={(e) => setPontos(e.target.value)} placeholder="0" />
        </label>
        <label className="block space-y-1">
          <span className="text-[13px] font-bold text-ink">Observação {pontos && pontos !== "0" ? "(obrigatória)" : "(opcional)"}</span>
          <input className={campo} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: pontos herdados do ranking 2026" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={salvando}>
          {salvando ? "Adicionando…" : "Adicionar"}
        </Button>
        <Button variant="ghost" onClick={onCancelar}>
          Fechar
        </Button>
      </div>
    </form>
  );
}

function LancarPontos({ onLancar, onCancelar }: { onLancar: (b: { pontos: string; observacao: string }) => Promise<void>; onCancelar: () => void }) {
  const [pontos, setPontos] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <form
      className="mt-3 space-y-2 rounded-[10px] bg-sand p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
          await onLancar({ pontos, observacao });
        } catch (err: any) {
          setErro(err.message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      {erro && <Alert>{erro}</Alert>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_auto]">
        <input autoFocus type="number" step={1} className={campo} value={pontos} onChange={(e) => setPontos(e.target.value)} placeholder="+10 ou -5" aria-label="Pontos" />
        <input className={campo} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Motivo do lançamento" aria-label="Observação" />
        <div className="flex gap-2">
          <Button type="submit" variant="dark" disabled={salvando}>
            Lançar
          </Button>
          <Button variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  );
}
