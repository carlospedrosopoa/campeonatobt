"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Play, RefreshCcw, Save, SkipForward, Sparkles, Tv, Users } from "lucide-react";

type Categoria = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
};

type CategoriaConfig = {
  versao: 1;
  formato: "GRUPOS" | "MATA_MATA" | "LIGA";
  tipoParticipacao?: "DUPLAS" | "SIMPLES";
  grupos?: { modo: "AUTO" | "MANUAL"; tamanhoAlvo: number; quantidade?: number };
  classificacao?: { porGrupo: number; melhoresTerceiros?: number };
};

type GrupoClassificacao = {
  grupoId: string;
  grupoNome: string;
  equipes: {
    equipeId: string;
    equipeNome?: string;
    pontos: number;
    jogosJogados: number;
    jogosVencidos: number;
    jogosPerdidos: number;
    saldoGames: number;
    gamesPro?: number;
  }[];
};

type Inscricao = {
  status: string;
  equipe: {
    id: string;
    nome: string | null;
    atletas?: { id: string; nome: string }[];
  };
};

type EquipeAprovada = {
  equipeId: string;
  equipeNome: string;
  atletas: string[];
};

type SorteioItem = EquipeAprovada & {
  grupoNome: string;
  ordem: number;
};

type SorteioPlanejado = {
  grupos: { nome: string; esperado: number }[];
  itens: SorteioItem[];
};

function nomeGrupoPorIndice(index: number) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < letters.length) return `Grupo ${letters[index]}`;
  const first = Math.floor(index / letters.length) - 1;
  const second = index % letters.length;
  return `Grupo ${letters[first] ?? "A"}${letters[second]}`;
}

function calcularQuantidadeGruposEsperada(totalEquipes: number, config: CategoriaConfig | null) {
  const tamanhoAlvo = config?.grupos?.tamanhoAlvo ?? 4;
  const qtdManual = config?.grupos?.modo === "MANUAL" ? config.grupos?.quantidade : undefined;
  return qtdManual && qtdManual > 0 ? qtdManual : Math.max(1, Math.ceil(totalEquipes / tamanhoAlvo));
}

function calcularTamanhosEsperados(totalEquipes: number, qtdGrupos: number) {
  const base = Math.floor(totalEquipes / qtdGrupos);
  const extras = totalEquipes % qtdGrupos;
  return Array.from({ length: qtdGrupos }, (_, index) => base + (index < extras ? 1 : 0));
}

function shuffleArray<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function criarSequenciaDeGrupos(grupos: { nome: string; esperado: number }[]) {
  const rounds = Math.max(...grupos.map((grupo) => grupo.esperado), 0);
  const sequencia: string[] = [];

  for (let round = 0; round < rounds; round += 1) {
    const ativos = shuffleArray(grupos.filter((grupo) => grupo.esperado > round).map((grupo) => grupo.nome));
    sequencia.push(...ativos);
  }

  return sequencia;
}

function montarSorteio(equipes: EquipeAprovada[], config: CategoriaConfig | null) {
  if (equipes.length < 2) {
    throw new Error("Necessário pelo menos 2 equipes aprovadas para montar o sorteio.");
  }

  const qtdGrupos = calcularQuantidadeGruposEsperada(equipes.length, config);
  const tamanhosEsperados = calcularTamanhosEsperados(equipes.length, qtdGrupos);
  if (tamanhosEsperados.some((tamanho) => tamanho < 2)) {
    throw new Error("A configuração atual gera grupo com menos de 2 equipes. Ajuste a dinâmica antes da live.");
  }

  const grupos = Array.from({ length: qtdGrupos }, (_, index) => ({
    nome: nomeGrupoPorIndice(index),
    esperado: tamanhosEsperados[index] ?? 0,
  }));
  const gruposNaSequencia = criarSequenciaDeGrupos(grupos);
  const equipesEmbaralhadas = shuffleArray(equipes);

  return {
    grupos,
    itens: equipesEmbaralhadas.map((equipe, index) => ({
      ...equipe,
      grupoNome: gruposNaSequencia[index] || grupos[0]?.nome || "Grupo A",
      ordem: index + 1,
    })),
  } satisfies SorteioPlanejado;
}

export default function AdminCategoriaSorteioPage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [torneioNome, setTorneioNome] = useState("Torneio");
  const [config, setConfig] = useState<CategoriaConfig | null>(null);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [classificacao, setClassificacao] = useState<GrupoClassificacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"SORTEANDO" | "RESULTADO">("SORTEANDO");
  const [sorteio, setSorteio] = useState<SorteioPlanejado | null>(null);
  const [revelados, setRevelados] = useState(0);
  const [ultimoRevealId, setUltimoRevealId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fullscreenAtivo, setFullscreenAtivo] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreenAtivo(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const equipesAprovadas = useMemo<EquipeAprovada[]>(() => {
    return inscricoes
      .filter((item) => item.status === "APROVADA")
      .map((item) => {
        const atletas = (item.equipe.atletas ?? []).map((atleta) => atleta.nome.trim()).filter(Boolean);
        const fallbackNome = atletas.join(" / ") || item.equipe.id.slice(0, 8);
        return {
          equipeId: item.equipe.id,
          equipeNome: (item.equipe.nome || fallbackNome).trim(),
          atletas,
        };
      })
      .sort((a, b) => a.equipeNome.localeCompare(b.equipeNome));
  }, [inscricoes]);

  const gruposVisiveis = useMemo(() => {
    if (!sorteio) return [] as { nome: string; esperado: number; equipes: SorteioItem[] }[];

    return sorteio.grupos.map((grupo) => ({
      ...grupo,
      equipes: sorteio.itens.filter((item) => item.grupoNome === grupo.nome).filter((item) => modo === "RESULTADO" || item.ordem <= revelados),
    }));
  }, [modo, revelados, sorteio]);

  const proximaEquipe = useMemo(() => {
    if (!sorteio) return null;
    return sorteio.itens[revelados] ?? null;
  }, [revelados, sorteio]);

  const ultimaEquipe = useMemo(() => {
    if (!sorteio || revelados <= 0) return null;
    return sorteio.itens[revelados - 1] ?? null;
  }, [revelados, sorteio]);

  const sorteioCompleto = Boolean(sorteio && revelados >= sorteio.itens.length);
  const totalRestante = Math.max((sorteio?.itens.length ?? 0) - revelados, 0);
  const gruposJaGerados = classificacao.length > 0;

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);

      const [resTorneio, resCategorias, resConfig, resInscricoes, resClassificacao] = await Promise.all([
        fetch(`/api/v1/torneios/${slug}`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/config`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/inscricoes`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" }),
      ]);

      if (resTorneio.ok) {
        const torneio = (await resTorneio.json().catch(() => null)) as any;
        if (torneio?.nome) setTorneioNome(String(torneio.nome));
      }

      if (!resCategorias.ok) {
        const payload = (await resCategorias.json().catch(() => null)) as any;
        throw new Error(payload?.error || "Falha ao carregar categoria.");
      }
      if (!resInscricoes.ok) {
        const payload = (await resInscricoes.json().catch(() => null)) as any;
        throw new Error(payload?.error || "Falha ao carregar inscrições.");
      }

      const categorias = (await resCategorias.json()) as Categoria[];
      setCategoria(categorias.find((item) => item.id === categoriaId) ?? null);

      if (resConfig.ok) setConfig((await resConfig.json()) as CategoriaConfig);
      setInscricoes((await resInscricoes.json()) as Inscricao[]);
      if (resClassificacao.ok) setClassificacao((await resClassificacao.json()) as GrupoClassificacao[]);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [slug, categoriaId]);

  useEffect(() => {
    if (gruposJaGerados && !sorteio) {
      setModo("RESULTADO");
    }
  }, [gruposJaGerados, sorteio]);

  useEffect(() => {
    if (!ultimoRevealId) return;
    const timeout = window.setTimeout(() => setUltimoRevealId(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [ultimoRevealId]);

  function prepararSorteio() {
    try {
      setErro(null);
      const proximo = montarSorteio(equipesAprovadas, config);
      setSorteio(proximo);
      setRevelados(0);
      setUltimoRevealId(null);
      setModo("SORTEANDO");
    } catch (e: any) {
      setErro(e?.message || "Não foi possível preparar o sorteio.");
    }
  }

  function revelarProxima() {
    if (!sorteio) {
      prepararSorteio();
      return;
    }
    const alvo = sorteio.itens[revelados];
    if (!alvo) return;
    setModo("SORTEANDO");
    setRevelados((current) => current + 1);
    setUltimoRevealId(alvo.equipeId);
  }

  function revelarTudo() {
    if (!sorteio) {
      prepararSorteio();
      return;
    }
    setModo("RESULTADO");
    setRevelados(sorteio.itens.length);
    setUltimoRevealId(null);
  }

  async function salvarSorteio() {
    if (!sorteio || !sorteioCompleto) return;
    try {
      setSalvando(true);
      setErro(null);

      const payload = {
        grupos: sorteio.grupos.map((grupo) => ({
          nome: grupo.nome,
          equipes: sorteio.itens.filter((item) => item.grupoNome === grupo.nome).map((item) => item.equipeId),
        })),
      };

      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/montar-grupos-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resposta = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(resposta?.error || "Falha ao gravar os grupos.");

      alert("Grupos gravados com sucesso.");
      setModo("RESULTADO");
      setSorteio(null);
      setRevelados(0);
      setUltimoRevealId(null);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Não foi possível gravar os grupos.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarTelaCheia() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignora falha de fullscreen para não interromper a live.
    }
  }

  const resultadoAtual = useMemo(() => {
    if (sorteio) return gruposVisiveis;
    return classificacao.map((grupo) => ({
      nome: grupo.grupoNome,
      esperado: grupo.equipes.length,
      equipes: grupo.equipes.map((equipe, index) => ({
        equipeId: equipe.equipeId,
        equipeNome: equipe.equipeNome || equipe.equipeId.slice(0, 8),
        atletas: [] as string[],
        grupoNome: grupo.grupoNome,
        ordem: index + 1,
      })),
    }));
  }, [classificacao, gruposVisiveis, sorteio]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_45%,#020617_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Link
                href={`/admin/torneios/${slug}/categorias/${categoriaId}/jogos`}
                className="inline-flex items-center gap-2 text-sm text-slate-300 transition hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para a tela operacional
              </Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                Sorteio ao vivo
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{categoria ? categoria.nome : "Carregando categoria..."}</h1>
                <p className="mt-2 text-sm text-slate-300 sm:text-base">
                  {torneioNome}
                  {categoria ? ` • ${categoria.genero}` : ""}
                  {categoria?.vagasMaximas ? ` • ${categoria.vagasMaximas} vagas` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={alternarTelaCheia}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
              >
                <Tv className="h-4 w-4" />
                {fullscreenAtivo ? "Sair da tela cheia" : "Tela cheia"}
              </button>
              <button
                type="button"
                onClick={prepararSorteio}
                disabled={carregando || equipesAprovadas.length < 2}
                className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/20 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Novo embaralhamento
              </button>
              <button
                type="button"
                onClick={revelarProxima}
                disabled={carregando || equipesAprovadas.length < 2 || Boolean(sorteio && sorteioCompleto)}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Revelar próxima
              </button>
              <button
                type="button"
                onClick={revelarTudo}
                disabled={carregando || equipesAprovadas.length < 2 || !sorteio}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SkipForward className="h-4 w-4" />
                Fechar resultado
              </button>
              <button
                type="button"
                onClick={salvarSorteio}
                disabled={!sorteioCompleto || salvando}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {salvando ? "Gravando..." : "Gravar grupos"}
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Aprovadas</div>
              <div className="mt-1 text-2xl font-black leading-none">{equipesAprovadas.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Grupos</div>
              <div className="mt-1 text-2xl font-black leading-none">{sorteio?.grupos.length ?? classificacao.length ?? 0}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Reveladas</div>
              <div className="mt-1 text-2xl font-black leading-none">{revelados}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Restantes</div>
              <div className="mt-1 text-2xl font-black leading-none">{totalRestante}</div>
            </div>
          </div>
        </div>

        {erro && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{erro}</div>}

        {carregando ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">Carregando ambiente do sorteio...</div>
        ) : config?.formato !== "GRUPOS" ? (
          <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-8 text-center text-amber-50">
            Esta categoria nao esta configurada no formato de grupos. Ajuste a dinamica na tela operacional antes de usar o sorteio ao vivo.
          </div>
        ) : equipesAprovadas.length < 2 ? (
          <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-8 text-center text-amber-50">
            Ainda nao ha equipes aprovadas suficientes para fazer o sorteio ao vivo.
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1.42fr_0.58fr]">
            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Modo da live</div>
                    <div className="mt-1 flex items-center gap-2 text-lg font-bold">
                      <span className={modo === "SORTEANDO" ? "text-cyan-300" : "text-slate-300"}>Sorteando</span>
                      <span className="text-slate-600">/</span>
                      <button
                        type="button"
                        onClick={() => setModo("RESULTADO")}
                        className="text-emerald-200 transition hover:text-emerald-100"
                      >
                        Resultado
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-slate-300">
                    {gruposJaGerados && !sorteio ? "Esta categoria ja possui grupos gravados." : "Use esta tela so para a apresentacao da live."}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[24px] border border-cyan-400/20 bg-slate-950/70 p-5">
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/70">Destaque da vez</div>
                    <div className={`mt-4 rounded-[24px] border border-white/10 bg-white/5 p-6 ${ultimaEquipe ? "animate-draw-card" : ""}`}>
                      {ultimaEquipe ? (
                        <>
                          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-fuchsia-200">{ultimaEquipe.grupoNome}</div>
                          <div className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">{ultimaEquipe.equipeNome}</div>
                          {ultimaEquipe.atletas.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {ultimaEquipe.atletas.map((atleta) => (
                                <span
                                  key={atleta}
                                  className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-slate-200"
                                >
                                  {atleta}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-6 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/20 px-4 py-1.5 text-sm font-semibold text-emerald-100">
                            Encaixada no {ultimaEquipe.grupoNome}
                          </div>
                        </>
                      ) : (
                        <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                          <Users className="h-12 w-12 text-slate-500" />
                          <div className="mt-4 text-2xl font-black text-white">Pronto para sortear</div>
                          <p className="mt-2 max-w-md text-sm text-slate-300">
                            Embaralhe as equipes e revele uma por vez durante a live. A cada clique, a dupla entra com uma animação curta no grupo.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Próxima revelação</div>
                        <div className="mt-1 text-lg font-bold text-white">{proximaEquipe?.equipeNome || "Todas reveladas"}</div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-slate-200">
                        {revelados}/{sorteio?.itens.length ?? 0}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {(sorteio?.itens.slice(revelados, revelados + 5) ?? []).map((item, index) => (
                        <div
                          key={item.equipeId}
                          className={`rounded-2xl border px-4 py-3 transition ${
                            index === 0
                              ? "border-cyan-300/40 bg-cyan-400/10 text-white"
                              : "border-white/10 bg-white/5 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold">{item.equipeNome}</div>
                            <div
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                                index === 0 ? "bg-white/15 text-cyan-100" : "bg-white/10 text-slate-400"
                              }`}
                            >
                              {index === 0 ? "Na vez" : "Na fila"}
                            </div>
                          </div>
                        </div>
                      ))}
                      {(!sorteio || sorteioCompleto) && (
                        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-5 text-center text-sm text-emerald-100">
                          Sorteio fechado. Agora voce pode mostrar o resultado final e gravar os grupos.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {resultadoAtual.map((grupo) => (
                  <div
                    key={grupo.nome}
                    className="rounded-[24px] border border-white/10 bg-white/5 p-3.5 shadow-xl backdrop-blur"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Grupo</div>
                        <h2 className="mt-1 text-xl font-black text-white">{grupo.nome}</h2>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                        {grupo.equipes.length}/{grupo.esperado}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2.5">
                      {grupo.equipes.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 px-3 py-6 text-center text-xs text-slate-500">
                          Aguardando revelação
                        </div>
                      ) : (
                        grupo.equipes.map((equipe) => (
                          <div
                            key={equipe.equipeId}
                            className={`rounded-2xl border px-3 py-2.5 transition ${
                              ultimoRevealId === equipe.equipeId
                                ? "animate-slot-glow border-cyan-300/50 bg-cyan-400/15"
                                : "border-white/10 bg-slate-950/40"
                            }`}
                          >
                            <div className="text-sm font-bold text-white">{equipe.equipeNome}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Pool da live</div>
                <div className="mt-1 text-base font-bold text-white">Equipes aptas para o sorteio</div>
                <div className="mt-3 max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                  {equipesAprovadas.map((equipe) => {
                    const foiRevelada = Boolean(sorteio?.itens.find((item) => item.equipeId === equipe.equipeId && item.ordem <= revelados));
                    return (
                      <div
                        key={equipe.equipeId}
                        className={`rounded-xl border px-3 py-2 transition ${
                          foiRevelada ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-slate-950/40 text-slate-200"
                        }`}
                      >
                        <div className="text-sm font-semibold leading-tight">{equipe.equipeNome}</div>
                        {equipe.atletas.length > 0 && <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{equipe.atletas.join(" • ")}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Observações</div>
                <ul className="mt-3 space-y-2 text-xs text-slate-300">
                  <li>Use a tela operacional para ajustar formato, quantidade de grupos e demais regras.</li>
                  <li>Esta tela foi pensada para a transmissão, com revelação por dupla e visual limpo.</li>
                  <li>Os grupos só entram de fato no sistema quando você clicar em gravar.</li>
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>

      <style jsx>{`
        .animate-draw-card {
          animation: drawCardIn 520ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .animate-slot-glow {
          animation: slotGlow 1100ms ease-out;
        }

        @keyframes drawCardIn {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }
          60% {
            opacity: 1;
            transform: translateY(-4px) scale(1.01);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes slotGlow {
          0% {
            transform: scale(0.98);
            box-shadow: 0 0 0 rgba(34, 211, 238, 0);
          }
          35% {
            transform: scale(1.01);
            box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.2), 0 0 32px rgba(34, 211, 238, 0.2);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 rgba(34, 211, 238, 0);
          }
        }
      `}</style>
    </main>
  );
}
