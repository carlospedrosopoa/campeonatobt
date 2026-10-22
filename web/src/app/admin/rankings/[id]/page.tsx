"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Medal, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, GENERO_LABEL, PageHeader } from "@/components/admin/ui";
import { RankingForm, campo, formatarData, rotuloJanela } from "@/components/admin/rankings/ranking-form";

type Genero = "MASCULINO" | "FEMININO" | "MISTO" | "LIVRE";
type Ranking = { id: string; nome: string; descricao: string | null; janelaMeses: number; imagemUrl: string | null };
type Atleta = { usuarioId: string; nome: string; fotoUrl: string | null; permanente: number; entrada: number };
type Lancamento = {
  id: string;
  usuarioId: string;
  atleta: string;
  tipo: "INICIAL" | "MANUAL" | "TORNEIO";
  pontos: number;
  dataReferencia: string;
  observacao: string | null;
  torneio: string | null;
};
type Categoria = { id: string; nome: string; genero: Genero | null; atletas: Atleta[]; lancamentos: Lancamento[] };
type Dados = { ranking: Ranking; inicioEntrada: string; categorias: Categoria[] };
type AtletaPlay = { id: string; nome: string; email: string; telefone?: string | null; fotoUrl?: string | null };
type Criterio = "entrada" | "permanente";

const TIPO: Record<Lancamento["tipo"], { label: string; tone: "info" | "neutral" | "signal" }> = {
  INICIAL: { label: "Inicial", tone: "info" },
  MANUAL: { label: "Manual", tone: "neutral" },
  TORNEIO: { label: "Torneio", tone: "signal" },
};
const GENEROS: Genero[] = ["MASCULINO", "FEMININO", "MISTO", "LIVRE"];

function hoje() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function sinal(p: number) {
  return p > 0 ? `+${p}` : String(p);
}

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

/** Ordena pelo criterio (empate: o outro criterio, depois nome) e numera; empate total divide a posicao. */
function classificar(atletas: Atleta[], criterio: Criterio) {
  const outro: Criterio = criterio === "entrada" ? "permanente" : "entrada";
  const ordenados = [...atletas].sort((a, b) => b[criterio] - a[criterio] || b[outro] - a[outro] || a.nome.localeCompare(b.nome, "pt-BR"));
  let posicao = 0;
  return ordenados.map((a, i) => {
    const ant = ordenados[i - 1];
    if (!ant || ant[criterio] !== a[criterio] || ant[outro] !== a[outro]) posicao = i + 1;
    return { ...a, posicao };
  });
}

export default function RankingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [formCategoria, setFormCategoria] = useState<"nova" | "editar" | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [lancandoPara, setLancandoPara] = useState<string | null>(null);
  const [criterio, setCriterio] = useState<Criterio>("entrada");

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/rankings/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErro(data?.error || "Não foi possível carregar o ranking");
      return null;
    }
    setDados(data);
    return data as Dados;
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const categoria = useMemo(() => {
    if (!dados) return null;
    return dados.categorias.find((c) => c.id === categoriaId) ?? dados.categorias[0] ?? null;
  }, [dados, categoriaId]);

  const classificacao = useMemo(() => (categoria ? classificar(categoria.atletas, criterio) : []), [categoria, criterio]);

  async function acao(body: Record<string, unknown>) {
    const res = await fetch(`/api/v1/admin/rankings/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Não foi possível salvar");
    await carregar();
    return data;
  }

  async function acaoComAviso(body: Record<string, unknown>) {
    setErro(null);
    try {
      await acao(body);
    } catch (e: any) {
      setErro(e.message);
    }
  }

  function trocarCategoria(cid: string) {
    setCategoriaId(cid);
    setAdicionando(false);
    setLancandoPara(null);
    setFormCategoria(null);
  }

  if (!dados) {
    return <div className="mx-auto max-w-5xl">{erro ? <Alert>{erro}</Alert> : <p className="text-sm text-muted">Carregando…</p>}</div>;
  }

  const { ranking, inicioEntrada, categorias } = dados;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Ranking"
        title={ranking.nome}
        description={
          <>
            Entrada: pontos dos {rotuloJanela(ranking.janelaMeses)} (desde {formatarData(inicioEntrada)}) · Permanente: todos os pontos
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
                  if (!confirm(`Excluir o ranking "${ranking.nome}" com todas as categorias, atletas e pontos?`)) return;
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
            inicial={{
              nome: ranking.nome,
              descricao: ranking.descricao ?? "",
              janelaMeses: String(ranking.janelaMeses),
              imagemUrl: ranking.imagemUrl ?? "",
            }}
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

      <div className="flex flex-wrap items-center gap-2">
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => trocarCategoria(c.id)}
            className={cn(
              "h-9 rounded-full border px-4 text-[13px] font-bold transition-colors",
              c.id === categoria?.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:bg-sand"
            )}
          >
            {c.nome}
            <span className={cn("ml-1.5 text-xs", c.id === categoria?.id ? "text-white/70" : "text-muted")}>{c.atletas.length}</span>
          </button>
        ))}
        {formCategoria !== "nova" && (
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setFormCategoria("nova")}>
            Categoria
          </Button>
        )}
      </div>

      {formCategoria === "nova" && (
        <CategoriaForm
          textoBotao="Criar categoria"
          onCancelar={() => setFormCategoria(null)}
          onSalvar={async (nome, genero) => {
            const nova = await acao({ acao: "criarCategoria", nome, genero });
            setFormCategoria(null);
            if (nova?.id) setCategoriaId(nova.id);
          }}
        />
      )}

      {categorias.length === 0 ? (
        formCategoria !== "nova" && (
          <EmptyState
            icon={<Medal />}
            title="Crie as categorias do ranking"
            description="Ex.: Masculina C, Feminina B, Mista. Cada categoria tem a sua classificação."
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setFormCategoria("nova")}>
                Nova categoria
              </Button>
            }
          />
        )
      ) : (
        categoria && (
          <>
            {formCategoria === "editar" && (
              <CategoriaForm
                inicial={{ nome: categoria.nome, genero: categoria.genero }}
                textoBotao="Salvar categoria"
                onCancelar={() => setFormCategoria(null)}
                onSalvar={async (nome, genero) => {
                  await acao({ acao: "editarCategoria", categoriaId: categoria.id, nome, genero });
                  setFormCategoria(null);
                }}
              />
            )}

            <Card>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {categoria.nome}
                    {categoria.genero && <Badge tone="neutral">{GENERO_LABEL[categoria.genero] ?? categoria.genero}</Badge>}
                  </span>
                }
                description={`${categoria.atletas.length} ${categoria.atletas.length === 1 ? "atleta" : "atletas"}`}
                actions={
                  <>
                    <div className="flex rounded-[10px] border border-line p-0.5" role="group" aria-label="Ordenar por">
                      {(["entrada", "permanente"] as Criterio[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCriterio(c)}
                          className={cn(
                            "h-8 rounded-[8px] px-3 text-[13px] font-bold",
                            criterio === c ? "bg-ink text-white" : "text-ink-2 hover:bg-sand"
                          )}
                        >
                          {c === "entrada" ? "Entrada" : "Permanente"}
                        </button>
                      ))}
                    </div>
                    {!adicionando && (
                      <Button variant="primary" icon={<UserPlus />} onClick={() => setAdicionando(true)}>
                        Adicionar atleta
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" aria-label="Editar categoria" icon={<Pencil />} onClick={() => setFormCategoria("editar")} />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Excluir categoria"
                      icon={<Trash2 />}
                      onClick={() => {
                        if (confirm(`Excluir a categoria "${categoria.nome}" com os atletas e pontos dela?`)) {
                          setCategoriaId(null);
                          void acaoComAviso({ acao: "excluirCategoria", categoriaId: categoria.id });
                        }
                      }}
                    />
                  </>
                }
              />
              {adicionando && (
                <AdicionarAtleta
                  onCancelar={() => setAdicionando(false)}
                  onAdicionar={(b) => acao({ acao: "adicionarAtleta", categoriaId: categoria.id, ...b })}
                />
              )}
              {classificacao.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={<Medal />} title="Nenhum atleta nesta categoria" description="Adicione os atletas e, se for o caso, a pontuação inicial de cada um." />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted sm:px-5">
                    <span className="w-7" />
                    <span className="flex-1">Atleta</span>
                    <span className={cn("w-16 text-right", criterio === "entrada" && "text-ink")}>Entrada</span>
                    <span className={cn("w-16 text-right", criterio === "permanente" && "text-ink")}>Perm.</span>
                    <span className="w-[76px] sm:w-[118px]" />
                  </div>
                  <ul className="divide-y divide-line">
                    {classificacao.map((l) => (
                      <li key={l.usuarioId} className="px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-3">
                          <span className="w-7 text-right font-display text-lg font-bold text-ink-2">{l.posicao}º</span>
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Avatar nome={l.nome} fotoUrl={l.fotoUrl} />
                            <span className="truncate text-sm font-bold text-ink">{l.nome}</span>
                          </span>
                          <span className={cn("w-16 text-right font-display text-xl font-bold", criterio === "entrada" ? "text-ink" : "text-muted")}>
                            {l.entrada}
                          </span>
                          <span className={cn("w-16 text-right font-display text-xl font-bold", criterio === "permanente" ? "text-ink" : "text-muted")}>
                            {l.permanente}
                          </span>
                          <span className="flex w-[76px] justify-end gap-1 sm:w-[118px]">
                            <Button size="sm" icon={<Plus />} onClick={() => setLancandoPara(lancandoPara === l.usuarioId ? null : l.usuarioId)}>
                              <span className="hidden sm:inline">Pontos</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Remover ${l.nome}`}
                              icon={<X />}
                              onClick={() => {
                                if (confirm(`Remover ${l.nome} de ${categoria.nome}? Os pontos dele nesta categoria também saem.`)) {
                                  void acaoComAviso({ acao: "removerAtleta", categoriaId: categoria.id, usuarioId: l.usuarioId });
                                }
                              }}
                            />
                          </span>
                        </div>
                        {lancandoPara === l.usuarioId && (
                          <LancarPontos
                            onCancelar={() => setLancandoPara(null)}
                            onLancar={async (b) => {
                              await acao({ acao: "lancar", categoriaId: categoria.id, usuarioId: l.usuarioId, ...b });
                              setLancandoPara(null);
                            }}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <Card>
              <CardHeader
                title={`Lançamentos · ${categoria.nome}`}
                description={`Pontos com data a partir de ${formatarData(inicioEntrada)} contam na entrada; os anteriores só no permanente.`}
              />
              {categoria.lancamentos.length === 0 ? (
                <p className="p-4 text-sm text-muted sm:px-5">Nenhum lançamento ainda.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {categoria.lancamentos.map((l) => {
                    const naEntrada = l.dataReferencia >= inicioEntrada;
                    return (
                      <li key={l.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                        <span className={cn("w-12 shrink-0 text-right font-display text-lg font-bold", l.pontos < 0 ? "text-red-700" : "text-[#17663f]")}>
                          {sinal(l.pontos)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-ink">{l.atleta}</span>
                            <Badge tone={TIPO[l.tipo].tone}>{TIPO[l.tipo].label}</Badge>
                            {!naEntrada && <Badge tone="warning">Só permanente</Badge>}
                          </div>
                          {(l.observacao || l.torneio) && <p className="text-[13px] text-ink-2">{l.observacao || l.torneio}</p>}
                          <p className="text-xs text-muted">{formatarData(l.dataReferencia)}</p>
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
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )
      )}
    </div>
  );
}

function CategoriaForm({
  inicial,
  textoBotao,
  onSalvar,
  onCancelar,
}: {
  inicial?: { nome: string; genero: Genero | null };
  textoBotao: string;
  onSalvar: (nome: string, genero: Genero | "") => Promise<void>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [genero, setGenero] = useState<Genero | "">(inicial?.genero ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <Card className="p-4">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvando(true);
          setErro(null);
          try {
            await onSalvar(nome, genero);
          } catch (err: any) {
            setErro(err.message);
          } finally {
            setSalvando(false);
          }
        }}
      >
        {erro && <Alert>{erro}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
          <input autoFocus className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da categoria (ex.: Masculina C)" aria-label="Nome da categoria" />
          <select className={campo} value={genero} onChange={(e) => setGenero(e.target.value as Genero | "")} aria-label="Gênero">
            <option value="">Gênero (opcional)</option>
            {GENEROS.map((g) => (
              <option key={g} value={g}>
                {GENERO_LABEL[g] ?? g}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={salvando}>
              {textoBotao}
            </Button>
            <Button variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function AdicionarAtleta({
  onAdicionar,
  onCancelar,
}: {
  onAdicionar: (b: { atleta: AtletaPlay; pontosIniciais: string; observacao: string; dataReferencia: string }) => Promise<unknown>;
  onCancelar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<AtletaPlay[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [atleta, setAtleta] = useState<AtletaPlay | null>(null);
  const [pontos, setPontos] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataReferencia, setDataReferencia] = useState(hoje());
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

  const temPontos = pontos !== "" && pontos !== "0";

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
          await onAdicionar({ atleta, pontosIniciais: pontos, observacao, dataReferencia });
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[130px_160px_1fr]">
        <label className="block space-y-1">
          <span className="text-[13px] font-bold text-ink">Pontuação inicial</span>
          <input type="number" step={1} className={campo} value={pontos} onChange={(e) => setPontos(e.target.value)} placeholder="0" />
        </label>
        <label className="block space-y-1">
          <span className="text-[13px] font-bold text-ink">Data dos pontos</span>
          <input type="date" className={campo} value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} disabled={!temPontos} />
        </label>
        <label className="col-span-2 block space-y-1 sm:col-span-1">
          <span className="text-[13px] font-bold text-ink">Observação {temPontos ? "(obrigatória)" : "(opcional)"}</span>
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

function LancarPontos({
  onLancar,
  onCancelar,
}: {
  onLancar: (b: { pontos: string; observacao: string; dataReferencia: string }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [pontos, setPontos] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataReferencia, setDataReferencia] = useState(hoje());
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
          await onLancar({ pontos, observacao, dataReferencia });
        } catch (err: any) {
          setErro(err.message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      {erro && <Alert>{erro}</Alert>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_150px_1fr_auto]">
        <input autoFocus type="number" step={1} className={campo} value={pontos} onChange={(e) => setPontos(e.target.value)} placeholder="+10 ou -5" aria-label="Pontos" />
        <input type="date" className={campo} value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} aria-label="Data dos pontos" />
        <input className={cn(campo, "col-span-2 sm:col-span-1")} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Motivo do lançamento" aria-label="Observação" />
        <div className="col-span-2 flex gap-2 sm:col-span-1">
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
