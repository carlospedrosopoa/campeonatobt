"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Banknote, Calendar, Crown, FileText, Gamepad2, ImageIcon, MapPin, Network, Pencil, Save, Swords, Trophy, Trash2, X } from "lucide-react";
import { gerarCardPartidaAdmin } from "@/lib/match-card-client";
import { abrirTabelaJogosPdfPorChaves } from "@/lib/jogos-tabela-pdf-client";
import { exportarPlanilhaContingenciaCategoria } from "@/lib/jogos-contingencia-excel-client";

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
  grupos?: { modo: "AUTO" | "MANUAL"; tamanhoAlvo: number; quantidade?: number };
  classificacao?: { porGrupo: number; melhoresTerceiros?: number };
  fase2?: { habilitada: boolean; temFinal: boolean };
  regrasPartida?: {
    tipo: "SETS";
    melhorDe: 1 | 3;
    gamesPorSet: 4 | 5 | 6;
    tiebreak: { habilitado: boolean; em: number; ate: number; diffMin: number };
    superTiebreakDecisivo?: { habilitado: boolean; ate: number; diffMin: number };
    incluirSuperTieEmGames?: boolean;
  };
  desempate?: string[];
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

type Partida = {
  id: string;
  fase: string;
  status: string;
  rodadaId?: string | null;
  rodadaNome?: string | null;
  rodadaNumero?: number | null;
  grupoId: string | null;
  grupoNome: string | null;
  arenaId?: string | null;
  arenaNome?: string | null;
  arenaLogoUrl?: string | null;
  quadra?: string | null;
  dataHorario?: string | null;
  dataLimite?: string | null;
  fotoUrl?: string | null;
  transmissaoUrl?: string | null;
  equipeAId: string;
  equipeANome: string | null;
  equipeAAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
  equipeBId: string;
  equipeBNome: string | null;
  equipeBAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
  vencedorId: string | null;
  placarA: number;
  placarB: number;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

type Inscricao = {
  status: string;
  equipe: {
    id: string;
    nome: string | null;
    atletas?: { id: string; nome: string }[];
  };
};

type ResultadoFinal = { campeao: string; vice: string } | null;

const getStatusBadge = (status: string, dataHorario?: string | null) => {
  if (status === "AGENDADA" && !dataHorario) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-amber-50 text-amber-700 border-amber-100">
        A definir
      </span>
    );
  }
  const styles: Record<string, string> = {
    AGENDADA: "bg-blue-50 text-blue-700 border-blue-100",
    FINALIZADA: "bg-green-50 text-green-700 border-green-100",
    WO: "bg-red-50 text-red-700 border-red-100",
    CANCELADA: "bg-slate-100 text-slate-500 border-slate-200",
  };
  const className = styles[status] || "bg-slate-50 text-slate-600 border-slate-100";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${className}`}>
      {status}
    </span>
  );
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

export default function AdminCategoriaJogosPage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const [config, setConfig] = useState<CategoriaConfig | null>(null);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [gerandoGrupos, setGerandoGrupos] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [gerandoMataMata, setGerandoMataMata] = useState(false);
  const [gerandoProximaFase, setGerandoProximaFase] = useState(false);
  const [resetando, setResetando] = useState(false);

  const [classificacao, setClassificacao] = useState<GrupoClassificacao[]>([]);

  const [fasePartidas, setFasePartidas] = useState<"GRUPOS" | "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL">("GRUPOS");
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [carregandoPartidas, setCarregandoPartidas] = useState(false);
  const [filtroAtletaId, setFiltroAtletaId] = useState("");

  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal>(null);

  const [editPartidaId, setEditPartidaId] = useState<string | null>(null);
  const [pendingOpenPartidaId, setPendingOpenPartidaId] = useState<string | null>(null);
  const [salvandoPartida, setSalvandoPartida] = useState(false);
  const [editConfrontoId, setEditConfrontoId] = useState<string | null>(null);
  const [salvandoConfronto, setSalvandoConfronto] = useState(false);
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);
  const [carregandoEquipes, setCarregandoEquipes] = useState(false);
  const [confrontoEquipeAId, setConfrontoEquipeAId] = useState("");
  const [confrontoEquipeBId, setConfrontoEquipeBId] = useState("");
  const [modoManutencaoConfronto, setModoManutencaoConfronto] = useState(false);
  const [trocaGruposOpen, setTrocaGruposOpen] = useState(false);
  const [trocaGrupoEquipeAId, setTrocaGrupoEquipeAId] = useState("");
  const [trocaGrupoEquipeBId, setTrocaGrupoEquipeBId] = useState("");
  const [salvandoTrocaGrupos, setSalvandoTrocaGrupos] = useState(false);
  const [montagemGruposOpen, setMontagemGruposOpen] = useState(false);
  const [montagemGruposLinhas, setMontagemGruposLinhas] = useState<
    { equipeId: string; equipeNome: string; atletas: string[]; grupoNome: string }[]
  >([]);
  const [carregandoMontagemGrupos, setCarregandoMontagemGrupos] = useState(false);
  const [salvandoMontagemGrupos, setSalvandoMontagemGrupos] = useState(false);
  const [formPlacar, setFormPlacar] = useState({
    s1a: "",
    s1b: "",
    tb1a: "",
    tb1b: "",
    s2a: "",
    s2b: "",
    tb2a: "",
    tb2b: "",
    s3a: "",
    s3b: "",
  });
  const [fotoUrl, setFotoUrl] = useState("");
  const [transmissaoUrl, setTransmissaoUrl] = useState("");
  const [torneioNome, setTorneioNome] = useState("Torneio");
  const [torneioTemplateUrl, setTorneioTemplateUrl] = useState<string | null>(null);
  const [torneioBannerUrl, setTorneioBannerUrl] = useState<string | null>(null);
  const [torneioCardApenasComFotos, setTorneioCardApenasComFotos] = useState(false);
  const [gerandoRelatorioJogos, setGerandoRelatorioJogos] = useState(false);
  const [gerandoPlanilhaContingencia, setGerandoPlanilhaContingencia] = useState(false);

  function getRegraJogoValue(regras?: CategoriaConfig["regrasPartida"]) {
    if (regras?.melhorDe === 3 && regras?.superTiebreakDecisivo?.habilitado) return "2SETS_SUPER10";
    if (regras?.melhorDe === 1 && regras?.gamesPorSet === 5 && regras?.tiebreak?.habilitado === false) return "1SET_5_SEM_TB";
    return "1SET_6_TB";
  }

  async function carregarCategoria() {
    const resCat = await fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" });
    if (!resCat.ok) {
      const msg = await resCat.json().catch(() => null);
      throw new Error(msg?.error || "Falha ao carregar categoria");
    }
    const cats = (await resCat.json()) as Categoria[];
    return cats.find((c) => c.id === categoriaId) ?? null;
  }

  async function carregarConfigEClassificacao() {
    const [resConfig, resClass] = await Promise.all([
      fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/config`, { cache: "no-store" }),
      fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" }),
    ]);

    if (resConfig.ok) setConfig((await resConfig.json()) as CategoriaConfig);
    if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
  }

  async function carregarPartidas(fase?: typeof fasePartidas) {
    try {
      setCarregandoPartidas(true);
      const faseQuery = fase ?? fasePartidas;
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=${faseQuery}`, { cache: "no-store" });
      if (!res.ok) return;
      setPartidas((await res.json()) as Partida[]);
    } finally {
      setCarregandoPartidas(false);
    }
  }

  async function carregarResultadoFinal() {
    try {
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=FINAL`, { cache: "no-store" });
      if (!res.ok) return setResultadoFinal(null);
      const jogos = (await res.json()) as Partida[];
      const final = jogos.find((p) => (p.status === "FINALIZADA" || p.status === "WO") && p.vencedorId);
      if (!final) return setResultadoFinal(null);

      const campeao = final.vencedorId === final.equipeAId ? final.equipeANome || final.equipeAId.slice(0, 8) : final.equipeBNome || final.equipeBId.slice(0, 8);
      const vice = final.vencedorId === final.equipeAId ? final.equipeBNome || final.equipeBId.slice(0, 8) : final.equipeANome || final.equipeAId.slice(0, 8);
      setResultadoFinal({ campeao, vice });
    } catch {
      setResultadoFinal(null);
    }
  }

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const resTorneio = await fetch(`/api/v1/torneios/${slug}`, { cache: "no-store" });
        if (resTorneio.ok) {
          const t = (await resTorneio.json()) as any;
          if (t?.nome) setTorneioNome(String(t.nome));
          setTorneioTemplateUrl((t?.templateUrl as string | null | undefined) ?? null);
          setTorneioBannerUrl((t?.bannerUrl as string | null | undefined) ?? null);
          setTorneioCardApenasComFotos(Boolean(t?.cardApenasComFotos));
          if (t?.superCampeonato) {
            setRedirecting(true);
            const qs = typeof window !== "undefined" ? window.location.search : "";
            router.replace(`/admin/torneios/${slug}/categorias/${categoriaId}/jogos/super${qs}`);
            return;
          }
        }
        const cat = await carregarCategoria();
        if (!ativo) return;
        setCategoria(cat);
        await carregarConfigEClassificacao();
        await carregarResultadoFinal();
      } catch (e: any) {
        if (!ativo) return;
        setErro(e?.message || "Erro inesperado");
      } finally {
        if (!ativo) return;
        setCarregando(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [slug, categoriaId, router]);

  useEffect(() => {
    void carregarPartidas();
  }, [slug, categoriaId, fasePartidas]);

  useEffect(() => {
    const partidaId = (searchParams.get("partidaId") || "").trim();
    if (!partidaId) return;

    const fase = (searchParams.get("fase") || "").trim().toUpperCase();
    if (fase === "GRUPOS" || fase === "OITAVAS" || fase === "QUARTAS" || fase === "SEMI" || fase === "FINAL") {
      setFasePartidas(fase as any);
    }
    setPendingOpenPartidaId(partidaId);
  }, [searchParams]);

  useEffect(() => {
    if (!pendingOpenPartidaId) return;
    const partida = partidas.find((p) => p.id === pendingOpenPartidaId);
    if (!partida) return;

    startEditPartida(partida);
    setPendingOpenPartidaId(null);

    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("partidaId");
    sp.delete("fase");
    const qs = sp.toString();
    router.replace(`/admin/torneios/${slug}/categorias/${categoriaId}/jogos${qs ? `?${qs}` : ""}`);
  }, [pendingOpenPartidaId, partidas, router, searchParams, slug, categoriaId]);

  useEffect(() => {
    if (!editPartidaId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditPartidaId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editPartidaId]);

  useEffect(() => {
    if (!editConfrontoId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditConfrontoId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editConfrontoId]);

  useEffect(() => {
    if (!trocaGruposOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrocaGruposOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [trocaGruposOpen]);

  useEffect(() => {
    if (!montagemGruposOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMontagemGruposOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [montagemGruposOpen]);

  const titulo = useMemo(() => (categoria ? `Jogos — ${categoria.nome}` : "Jogos"), [categoria]);

  const equipesDosGrupos = useMemo(() => {
    return classificacao.flatMap((g) =>
      g.equipes.map((e) => ({
        grupoId: g.grupoId,
        grupoNome: g.grupoNome,
        equipeId: e.equipeId,
        equipeNome: e.equipeNome || e.equipeId.slice(0, 8),
      }))
    );
  }, [classificacao]);

  const gruposEsperadosMontagem = useMemo(() => {
    if (!config || montagemGruposLinhas.length === 0) return [] as { nome: string; esperado: number; atual: number }[];
    const qtdGrupos = calcularQuantidadeGruposEsperada(montagemGruposLinhas.length, config);
    const tamanhosEsperados = calcularTamanhosEsperados(montagemGruposLinhas.length, qtdGrupos);
    return Array.from({ length: qtdGrupos }, (_, index) => {
      const nome = nomeGrupoPorIndice(index);
      const atual = montagemGruposLinhas.filter((linha) => linha.grupoNome === nome).length;
      return { nome, esperado: tamanhosEsperados[index] ?? 0, atual };
    });
  }, [config, montagemGruposLinhas]);

  function formatPlacar(detalhes: Partida["detalhesPlacar"]) {
    if (!detalhes || detalhes.length === 0) return "X";
    return detalhes
      .slice()
      .sort((a, b) => a.set - b.set)
      .map((s) => {
        if (s.tiebreak && s.tbA !== undefined && s.tbB !== undefined) {
          return `${s.a}-${s.b} (${s.tbA}-${s.tbB})`;
        }
        return `${s.a}-${s.b}`;
      })
      .join(" ");
  }

  function formatDataHora(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const atletasFiltroOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partidas) {
      for (const a of p.equipeAAtletas ?? []) {
        if (a?.id && a?.nome) map.set(a.id, a.nome);
      }
      for (const a of p.equipeBAtletas ?? []) {
        if (a?.id && a?.nome) map.set(a.id, a.nome);
      }
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [partidas]);

  useEffect(() => {
    if (!filtroAtletaId) return;
    if (atletasFiltroOptions.some((a) => a.id === filtroAtletaId)) return;
    setFiltroAtletaId("");
  }, [filtroAtletaId, atletasFiltroOptions]);

  const partidasFiltradas = useMemo(() => {
    if (!filtroAtletaId) return partidas;
    return partidas.filter((p) => {
      const a = (p.equipeAAtletas ?? []).some((x) => x.id === filtroAtletaId);
      const b = (p.equipeBAtletas ?? []).some((x) => x.id === filtroAtletaId);
      return a || b;
    });
  }, [partidas, filtroAtletaId]);

  const partidasAgrupadasPorGrupo = useMemo(() => {
    if (fasePartidas !== "GRUPOS") return [] as { grupoNome: string; partidas: Partida[] }[];

    const gruposMap = new Map<string, Partida[]>();
    for (const partida of partidasFiltradas) {
      const grupoNome = (partida.grupoNome || "Sem grupo").trim();
      const atual = gruposMap.get(grupoNome) ?? [];
      atual.push(partida);
      gruposMap.set(grupoNome, atual);
    }

    return Array.from(gruposMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true, sensitivity: "base" }))
      .map(([grupoNome, partidasDoGrupo]) => ({
        grupoNome,
        partidas: partidasDoGrupo,
      }));
  }, [fasePartidas, partidasFiltradas]);

  function renderPartidaCard(p: Partida) {
    return (
      <div key={p.id} className="group relative flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-md">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide text-slate-600">
                {p.grupoNome ?? "Grupo"}
              </span>
              {p.arenaNome ? (
                <span className="flex items-center gap-1">
                  {p.arenaLogoUrl ? <img src={p.arenaLogoUrl} alt={p.arenaNome} className="h-4 w-4 rounded-full object-cover" /> : null}
                  <MapPin className="h-3 w-3 text-slate-400" />
                  {p.arenaNome}
                  {p.quadra && <span className="text-slate-400">• Q. {p.quadra}</span>}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin className="h-3 w-3" />
                  Local a definir
                </span>
              )}
            </div>
            {getStatusBadge(p.status, p.dataHorario)}
          </div>

          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1 text-right">
              <div className="font-bold text-slate-900 leading-tight">{p.equipeANome || p.equipeAId.slice(0, 8)}</div>
            </div>

            <div className="flex flex-col items-center justify-center min-w-[3rem]">
              <span className="text-lg font-bold text-slate-900 font-mono tracking-tight bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                {formatPlacar(p.detalhesPlacar)}
              </span>
            </div>

            <div className="flex-1 text-left">
              <div className="font-bold text-slate-900 leading-tight">{p.equipeBNome || p.equipeBId.slice(0, 8)}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-auto">
          <div className="text-xs">
            {p.dataHorario ? (
              <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {formatDataHora(p.dataHorario)}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 font-medium">
                <Calendar className="h-3.5 w-3.5" />
                {p.dataLimite ? `Limite: ${formatDataHora(p.dataLimite)}` : "Sem agendamento"}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => gerarCardPartida(p)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
              title="Gerar card da partida"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => startEditPartida(p)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              Lançar placar
            </button>

            {fasePartidas !== "GRUPOS" && p.status === "AGENDADA" && (
              <button
                type="button"
                onClick={() => abrirAlterarConfronto(p)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                title="Alterar confronto"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  async function gerarRelatorioJogos() {
    if (!categoria) return;
    try {
      setGerandoRelatorioJogos(true);

      const resPartidas = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=GRUPOS`, { cache: "no-store" });
      const partidasGruposRaw = (resPartidas.ok ? ((await resPartidas.json()) as Partida[]) : []) ?? [];
      const partidasGrupos = filtroAtletaId
        ? partidasGruposRaw.filter((p) => {
            const a = (p.equipeAAtletas ?? []).some((x) => x.id === filtroAtletaId);
            const b = (p.equipeBAtletas ?? []).some((x) => x.id === filtroAtletaId);
            return a || b;
          })
        : partidasGruposRaw;

      if (partidasGrupos.length === 0) {
        alert("Nenhum jogo encontrado para gerar o PDF.");
        return;
      }
      abrirTabelaJogosPdfPorChaves({
        torneioNome,
        categoriaNome: categoria.nome,
        torneioBannerUrl,
        partidas: partidasGrupos,
        config,
        classificacao,
        superCampeonato: false,
      });
    } catch (e: any) {
      setErro(e?.message || "Erro ao gerar PDF da tabela de jogos");
    } finally {
      setGerandoRelatorioJogos(false);
    }
  }

  async function gerarPlanilhaContingencia() {
    if (!categoria) return;
    try {
      setGerandoPlanilhaContingencia(true);
      setErro(null);

      const [resPartidas, resClassificacao] = await Promise.all([
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=GRUPOS`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" }),
      ]);

      const partidasGrupos = (resPartidas.ok ? ((await resPartidas.json()) as Partida[]) : []) ?? [];
      const classificacaoAtual = (resClassificacao.ok ? ((await resClassificacao.json()) as GrupoClassificacao[]) : classificacao) ?? [];

      if (partidasGrupos.length === 0) {
        alert("Nenhum jogo de grupos encontrado para gerar a planilha.");
        return;
      }

      await exportarPlanilhaContingenciaCategoria({
        torneioNome,
        torneioSlug: slug,
        categoriaNome: categoria.nome,
        categoriaSlug: categoria.id,
        config,
        partidas: partidasGrupos,
        classificacao: classificacaoAtual,
        superCampeonato: false,
      });
    } catch (e: any) {
      setErro(e?.message || "Erro ao gerar Excel de contingência");
    } finally {
      setGerandoPlanilhaContingencia(false);
    }
  }

  function startEditPartida(p: Partida) {
    const det = (p.detalhesPlacar ?? []).slice().sort((a, b) => a.set - b.set);
    setEditPartidaId(p.id);
    setFotoUrl((p as any).fotoUrl || "");
    setTransmissaoUrl((p as any).transmissaoUrl || "");
    setFormPlacar({
      s1a: det[0]?.a?.toString?.() ?? "",
      s1b: det[0]?.b?.toString?.() ?? "",
      tb1a: det[0]?.tbA?.toString?.() ?? "",
      tb1b: det[0]?.tbB?.toString?.() ?? "",
      s2a: det[1]?.a?.toString?.() ?? "",
      s2b: det[1]?.b?.toString?.() ?? "",
      tb2a: det[1]?.tbA?.toString?.() ?? "",
      tb2b: det[1]?.tbB?.toString?.() ?? "",
      s3a: det[2]?.a?.toString?.() ?? "",
      s3b: det[2]?.b?.toString?.() ?? "",
    });
  }

  async function gerarCardPartida(p: Partida) {
    try {
      setErro(null);
      if ((p.fotoUrl || "").trim()) {
        window.open(p.fotoUrl as string, "_blank");
        return;
      }
      const result = await gerarCardPartidaAdmin({
        torneioNome,
        categoriaNome: categoria?.nome || "Categoria",
        cardApenasComFotos: torneioCardApenasComFotos,
        templateUrl: torneioTemplateUrl,
        syncFotosUrl: `/api/public/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}/sincronizar-fotos`,
        salvarNoGcs: true,
        uploadFolder: `campeonatos/cards/partidas/${slug}`,
        persistFotoUrlApi: `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}`,
        partida: {
          id: p.id,
          fase: p.fase,
          rodadaNome: p.rodadaNome ?? null,
          rodadaNumero: p.rodadaNumero ?? null,
          dataHorario: p.dataHorario ?? null,
          arenaNome: p.arenaNome ?? null,
          quadra: p.quadra ?? null,
          equipeANome: p.equipeANome ?? null,
          equipeAAtletas: p.equipeAAtletas ?? [],
          equipeBNome: p.equipeBNome ?? null,
          equipeBAtletas: p.equipeBAtletas ?? [],
        },
      });
      const url = (result?.url || "").trim();
      if (url) {
        setPartidas((prev) => prev.map((it) => (it.id === p.id ? { ...it, fotoUrl: url } : it)));
      }
    } catch (e: any) {
      setErro(e?.message || "Não foi possível gerar o card da partida");
    }
  }

  async function abrirAlterarConfronto(p: Partida) {
    setEditConfrontoId(p.id);
    setConfrontoEquipeAId(p.equipeAId);
    setConfrontoEquipeBId(p.equipeBId);
    setModoManutencaoConfronto(false);
    if (equipes.length > 0) return;
    try {
      setCarregandoEquipes(true);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/inscricoes`, { cache: "no-store" });
      if (!res.ok) return;
      const rows = (await res.json()) as Inscricao[];
      const aprovadas = rows
        .filter((i) => i.status === "APROVADA")
        .map((i) => ({ id: i.equipe.id, nome: (i.equipe.nome || i.equipe.id.slice(0, 8)).trim() }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setEquipes(aprovadas);
    } finally {
      setCarregandoEquipes(false);
    }
  }

  async function salvarPlacar(p: Partida) {
    try {
      setSalvandoPartida(true);
      setErro(null);

      // Salvar mídia (PATCH)
      await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotoUrl, transmissaoUrl }),
      });

      // Se todos os campos de placar estiverem vazios, considera que foi apenas edição de mídia
      const temAlgumPlacar = Object.values(formPlacar).some((v) => v.trim() !== "");
      if (!temAlgumPlacar) {
        await carregarPartidas();
        setEditPartidaId(null);
        return;
      }

      const regras = config?.regrasPartida;
      const melhorDe = regras?.melhorDe ?? 1;
      const superTie = regras?.superTiebreakDecisivo?.habilitado ?? false;
      const tbHabilitado = regras?.tiebreak?.habilitado ?? true;
      const tbEm = regras?.tiebreak?.em ?? (regras?.gamesPorSet ?? 6);

      const detalhes: any[] = [];
      const s1a = formPlacar.s1a.trim();
      const s1b = formPlacar.s1b.trim();
      if (!s1a || !s1b) throw new Error("Informe o placar do set 1");
      const s1aN = Number(s1a);
      const s1bN = Number(s1b);
      const isTbSet1 =
        tbHabilitado && ((s1aN === tbEm && s1bN === tbEm) || (Math.max(s1aN, s1bN) === tbEm + 1 && Math.min(s1aN, s1bN) === tbEm));
      if (isTbSet1) {
        const tb1a = formPlacar.tb1a.trim();
        const tb1b = formPlacar.tb1b.trim();
        if (!tb1a || !tb1b) throw new Error("Informe o tie-break do set 1");
        detalhes.push({ set: 1, a: s1aN, b: s1bN, tiebreak: true, tbA: Number(tb1a), tbB: Number(tb1b) });
      } else {
        detalhes.push({ set: 1, a: s1aN, b: s1bN });
      }

      if (melhorDe === 3) {
        const s2a = formPlacar.s2a.trim();
        const s2b = formPlacar.s2b.trim();
        if (!s2a || !s2b) throw new Error("Informe o placar do set 2");
        const s2aN = Number(s2a);
        const s2bN = Number(s2b);
        const isTbSet2 =
          tbHabilitado && ((s2aN === tbEm && s2bN === tbEm) || (Math.max(s2aN, s2bN) === tbEm + 1 && Math.min(s2aN, s2bN) === tbEm));
        if (isTbSet2) {
          const tb2a = formPlacar.tb2a.trim();
          const tb2b = formPlacar.tb2b.trim();
          if (!tb2a || !tb2b) throw new Error("Informe o tie-break do set 2");
          detalhes.push({ set: 2, a: s2aN, b: s2bN, tiebreak: true, tbA: Number(tb2a), tbB: Number(tb2b) });
        } else {
          detalhes.push({ set: 2, a: s2aN, b: s2bN });
        }

        const setsFrom = (set: any) => {
          if (!set) return { a: 0, b: 0 };
          const isTb = Boolean(set.tiebreak) && ((Number(set.a) === tbEm && Number(set.b) === tbEm) || (Math.max(Number(set.a), Number(set.b)) === tbEm + 1 && Math.min(Number(set.a), Number(set.b)) === tbEm));
          if (isTb && typeof set.tbA === "number" && typeof set.tbB === "number") {
            return { a: set.tbA > set.tbB ? 1 : 0, b: set.tbB > set.tbA ? 1 : 0 };
          }
          return { a: Number(set.a) > Number(set.b) ? 1 : 0, b: Number(set.b) > Number(set.a) ? 1 : 0 };
        };
        const s1w = setsFrom(detalhes[0]);
        const s2w = setsFrom(detalhes[1]);
        const aSets = s1w.a + s2w.a;
        const bSets = s1w.b + s2w.b;
        const precisaTerceiro = aSets === bSets;

        if (precisaTerceiro) {
          const s3a = formPlacar.s3a.trim();
          const s3b = formPlacar.s3b.trim();
          if (!s3a || !s3b) throw new Error(superTie ? "Informe o super tie" : "Informe o set 3");
          detalhes.push({ set: 3, a: Number(s3a), b: Number(s3b), tiebreak: superTie });
        }
      }

      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalhesPlacar: detalhes }),
      });

      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar placar");

      const proximaFaseCriada = payload?.proximaFaseCriada as string | null;
      const proximaFaseAtualizada = payload?.proximaFaseAtualizada as string | null;
      const proximaFaseDestino = proximaFaseCriada || proximaFaseAtualizada;
      if (fasePartidas === "GRUPOS") {
        await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
        const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
        if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
      }

      if (proximaFaseDestino) {
        setFasePartidas(proximaFaseDestino as any);
        await carregarPartidas(proximaFaseDestino as any);
      } else {
        await carregarPartidas();
      }
      await carregarResultadoFinal();
      setEditPartidaId(null);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoPartida(false);
    }
  }

  async function resetarJogos() {
    if (!confirm("TEM CERTEZA? Isso excluirá TODOS os jogos, grupos e rodadas desta categoria. As inscrições serão mantidas.")) return;
    if (!confirm("Confirmação final: Esta ação NÃO pode ser desfeita.")) return;

    try {
      setResetando(true);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/resetar-jogos`, { method: "POST" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao resetar jogos");
      }
      setClassificacao([]);
      setPartidas([]);
      setResultadoFinal(null);
      setFasePartidas("GRUPOS");
      alert("Jogos resetados com sucesso!");
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setResetando(false);
    }
  }

  function abrirTrocaEntreGrupos() {
    const primeira = equipesDosGrupos[0];
    const segunda = equipesDosGrupos.find((e) => e.grupoId !== primeira?.grupoId) ?? equipesDosGrupos[1];
    setTrocaGrupoEquipeAId(primeira?.equipeId ?? "");
    setTrocaGrupoEquipeBId(segunda?.equipeId ?? "");
    setTrocaGruposOpen(true);
  }

  async function abrirMontagemManualGrupos() {
    if (!config) return;
    try {
      setErro(null);
      setCarregandoMontagemGrupos(true);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/inscricoes`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar inscrições");

      const rows = (payload ?? []) as Inscricao[];
      const aprovadas = rows
        .filter((item) => item.status === "APROVADA")
        .map((item) => ({
          equipeId: item.equipe.id,
          equipeNome: (item.equipe.nome || item.equipe.id.slice(0, 8)).trim(),
          atletas: (item.equipe.atletas ?? []).map((atleta) => atleta.nome).filter(Boolean),
        }))
        .sort((a, b) => a.equipeNome.localeCompare(b.equipeNome));

      if (aprovadas.length < 2) throw new Error("Necessário pelo menos 2 duplas aprovadas para montar grupos");

      const qtdGrupos = calcularQuantidadeGruposEsperada(aprovadas.length, config);
      const tamanhosEsperados = calcularTamanhosEsperados(aprovadas.length, qtdGrupos);
      if (tamanhosEsperados.some((tamanho) => tamanho < 2)) {
        throw new Error("A configuração atual gera grupo com menos de 2 duplas. Ajuste a dinâmica antes de montar manualmente.");
      }

      const nomesGrupos = Array.from({ length: qtdGrupos }, (_, index) => nomeGrupoPorIndice(index));
      const gruposAtuaisMap = new Map(equipesDosGrupos.map((item) => [item.equipeId, item.grupoNome]));
      const temTodosNosGruposAtuais =
        equipesDosGrupos.length === aprovadas.length && aprovadas.every((item) => gruposAtuaisMap.has(item.equipeId));

      let linhas = aprovadas.map((item) => ({ ...item, grupoNome: "" }));
      if (temTodosNosGruposAtuais) {
        linhas = aprovadas.map((item) => ({
          ...item,
          grupoNome: gruposAtuaisMap.get(item.equipeId) || nomesGrupos[0] || "",
        }));
      } else {
        const atribuicoesPadrao = nomesGrupos.flatMap((nome, index) => Array.from({ length: tamanhosEsperados[index] ?? 0 }, () => nome));
        linhas = aprovadas.map((item, index) => ({
          ...item,
          grupoNome: atribuicoesPadrao[index] || nomesGrupos[0] || "",
        }));
      }

      setMontagemGruposLinhas(linhas);
      setMontagemGruposOpen(true);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setCarregandoMontagemGrupos(false);
    }
  }

  async function confirmarMontagemManualGrupos() {
    if (!config) return;
    try {
      setErro(null);
      setSalvandoMontagemGrupos(true);

      if (montagemGruposLinhas.length < 2) {
        throw new Error("Necessário pelo menos 2 duplas para montar grupos");
      }
      if (montagemGruposLinhas.some((linha) => !linha.grupoNome)) {
        throw new Error("Informe o grupo de todas as duplas antes de confirmar");
      }

      const gruposPayload = gruposEsperadosMontagem.map((grupo) => ({
        nome: grupo.nome,
        equipes: montagemGruposLinhas.filter((linha) => linha.grupoNome === grupo.nome).map((linha) => linha.equipeId),
      }));

      const grupoComQuantidadeInvalida = gruposEsperadosMontagem.find((grupo) => grupo.atual !== grupo.esperado);
      if (grupoComQuantidadeInvalida) {
        throw new Error(`Quantidade inválida no ${grupoComQuantidadeInvalida.nome}. Esperado: ${grupoComQuantidadeInvalida.esperado}.`);
      }

      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/montar-grupos-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, grupos: gruposPayload }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao montar grupos manualmente");

      const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
      if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
      setFasePartidas("GRUPOS");
      await carregarPartidas("GRUPOS");
      setMontagemGruposOpen(false);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoMontagemGrupos(false);
    }
  }

  if (redirecting) return <div className="text-sm text-slate-600">Redirecionando…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{titulo}</h1>
          {categoria && (
            <p className="text-sm text-slate-600">
              {categoria.genero} •{" "}
              {categoria.valorInscricao ? (
                <>
                  {Number(categoria.valorInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por atleta{" "}
                  <span className="text-slate-500">
                    (dupla: {(Number(categoria.valorInscricao) * 2).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
                  </span>
                </>
              ) : (
                "Sem taxa"
              )}{" "}
              • {categoria.vagasMaximas ? `${categoria.vagasMaximas} vagas` : "Sem limite"}
            </p>
          )}

          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1">
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/inscricoes`}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Banknote className="h-4 w-4" />
              Inscrições
            </Link>
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/jogos`}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Gamepad2 className="h-4 w-4" />
              Jogos
            </Link>
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/chave`}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Network className="h-4 w-4" />
              Chave
            </Link>
          </div>
        </div>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {resultadoFinal && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Concluído</div>
              <div className="text-lg font-bold text-slate-900">Resultado final</div>
            </div>
            <Trophy className="h-6 w-6 text-orange-500" />
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Campeão</div>
              <div className="mt-1 flex items-center gap-2 font-semibold text-slate-900">
                <Crown className="h-4 w-4 text-orange-500" />
                {resultadoFinal.campeao}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Vice</div>
              <div className="mt-1 flex items-center gap-2 font-semibold text-slate-900">
                <Swords className="h-4 w-4 text-slate-700" />
                {resultadoFinal.vice}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Dinâmica da categoria</h2>
            <p className="text-sm text-slate-600">Defina grupos, classificados e gere chaves.</p>
          </div>
        </div>

        {config ? (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Formato</label>
              <select
                value={config.formato}
                onChange={(e) => setConfig((p) => (p ? { ...p, formato: e.target.value as any } : p))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                <option value="GRUPOS">GRUPOS</option>
                <option value="LIGA">LIGA</option>
                <option value="MATA_MATA">MATA_MATA</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Regra do jogo</label>
              <select
                value={getRegraJogoValue(config.regrasPartida)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "2SETS_SUPER10") {
                    setConfig((p) =>
                      p
                        ? {
                            ...p,
                            regrasPartida: {
                              tipo: "SETS",
                              melhorDe: 3,
                              gamesPorSet: 6,
                              tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
                              superTiebreakDecisivo: { habilitado: true, ate: 10, diffMin: 2 },
                              incluirSuperTieEmGames: false,
                            },
                          }
                        : p
                    );
                  } else if (v === "1SET_5_SEM_TB") {
                    setConfig((p) =>
                      p
                        ? {
                            ...p,
                            regrasPartida: {
                              tipo: "SETS",
                              melhorDe: 1,
                              gamesPorSet: 5,
                              tiebreak: { habilitado: false, em: 5, ate: 0, diffMin: 2 },
                              superTiebreakDecisivo: { habilitado: false, ate: 10, diffMin: 2 },
                              incluirSuperTieEmGames: false,
                            },
                          }
                        : p
                    );
                  } else {
                    setConfig((p) =>
                      p
                        ? {
                            ...p,
                            regrasPartida: {
                              tipo: "SETS",
                              melhorDe: 1,
                              gamesPorSet: 6,
                              tiebreak: { habilitado: true, em: 6, ate: 7, diffMin: 2 },
                              superTiebreakDecisivo: { habilitado: false, ate: 10, diffMin: 2 },
                              incluirSuperTieEmGames: false,
                            },
                          }
                        : p
                    );
                  }
                }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                <option value="1SET_6_TB">1 set até 6 (tie no 6x6)</option>
                <option value="1SET_5_SEM_TB">1 set até 5 sem tie-break</option>
                <option value="2SETS_SUPER10">2 sets até 6 + super tie (até 10)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Grupos</label>
              <select
                value={config.grupos?.modo === "MANUAL" && config.grupos?.quantidade === 1 ? "UNICO" : "AUTO"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "UNICO") {
                    setConfig((p) =>
                      p
                        ? {
                            ...p,
                            grupos: {
                              ...(p.grupos ?? { modo: "AUTO", tamanhoAlvo: 4 }),
                              modo: "MANUAL",
                              quantidade: 1,
                            },
                          }
                        : p
                    );
                  } else {
                    setConfig((p) =>
                      p
                        ? {
                            ...p,
                            grupos: {
                              ...(p.grupos ?? { modo: "AUTO", tamanhoAlvo: 4 }),
                              modo: "AUTO",
                              quantidade: undefined,
                            },
                          }
                        : p
                    );
                  }
                }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                <option value="AUTO">Auto</option>
                <option value="UNICO">Grupo único</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Tamanho alvo do grupo</label>
              <select
                value={config.grupos?.tamanhoAlvo ?? 4}
                onChange={(e) =>
                  setConfig((p) =>
                    p ? { ...p, grupos: { ...(p.grupos ?? { modo: "AUTO", tamanhoAlvo: 4 }), tamanhoAlvo: Number(e.target.value) as any } } : p
                  )
                }
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
                <option value={6}>6</option>
                <option value={7}>7</option>
                <option value={8}>8</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Classificam por grupo</label>
              <input
                value={config.classificacao?.porGrupo ?? 2}
                onChange={(e) => setConfig((p) => (p ? { ...p, classificacao: { ...(p.classificacao ?? { porGrupo: 2 }), porGrupo: Number(e.target.value) } } : p))}
                type="number"
                min={1}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Melhores terceiros</label>
              <input
                value={config.classificacao?.melhoresTerceiros ?? 0}
                onChange={(e) =>
                  setConfig((p) =>
                    p ? { ...p, classificacao: { ...(p.classificacao ?? { porGrupo: 2 }), melhoresTerceiros: Number(e.target.value) || 0 } } : p
                  )
                }
                type="number"
                min={0}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Carregando configuração…</div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-xs text-slate-500">Desempate padrão: VITORIAS → SALDO_GAMES → CONFRONTO_DIRETO (ENTRE 2) → GAMES_PRO → SORTEIO</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!categoria || gerandoRelatorioJogos}
              onClick={gerarRelatorioJogos}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Gerar PDF da tabela de jogos agrupada por chave"
            >
              <FileText className="h-4 w-4" />
              {gerandoRelatorioJogos ? "Gerando…" : "PDF tabela jogos"}
            </button>

            <button
              type="button"
              disabled={!categoria || gerandoPlanilhaContingencia}
              onClick={gerarPlanilhaContingencia}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Gerar Excel offline para contingência com lancamento e classificacao por chave"
            >
              <FileText className="h-4 w-4" />
              {gerandoPlanilhaContingencia ? "Gerando…" : "Excel contingência"}
            </button>

            <button
              type="button"
              disabled={!config || salvandoConfig}
              onClick={async () => {
                if (!config) return;
                try {
                  setSalvandoConfig(true);
                  const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/config`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(config),
                  });
                  if (!res.ok) {
                    const msg = await res.json().catch(() => null);
                    throw new Error(msg?.error || "Falha ao salvar configuração");
                  }
                } catch (e: any) {
                  setErro(e?.message || "Erro inesperado");
                } finally {
                  setSalvandoConfig(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {salvandoConfig ? "Salvando…" : "Salvar config"}
            </button>

            <button
              type="button"
              disabled={gerandoGrupos || !config}
              onClick={async () => {
                if (!config) return;
                try {
                  setGerandoGrupos(true);
                  const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/gerar-grupos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(config),
                  });
                  if (!res.ok) {
                    const msg = await res.json().catch(() => null);
                    throw new Error(msg?.error || "Falha ao gerar grupos");
                  }
                  const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
                  if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
                  setFasePartidas("GRUPOS");
                  await carregarPartidas("GRUPOS");
                } catch (e: any) {
                  setErro(e?.message || "Erro inesperado");
                } finally {
                  setGerandoGrupos(false);
                }
              }}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {gerandoGrupos ? "Gerando…" : "Gerar grupos/jogos"}
            </button>

            <button
              type="button"
              disabled={!config || carregandoMontagemGrupos}
              onClick={abrirMontagemManualGrupos}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Definir manualmente em qual grupo cada dupla ficará"
            >
              {carregandoMontagemGrupos ? "Carregando…" : "Montar grupos manual"}
            </button>

            <button
              type="button"
              disabled={classificacao.length < 2 || salvandoTrocaGrupos}
              onClick={abrirTrocaEntreGrupos}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Trocar duas duplas entre grupos e regerar os jogos"
            >
              Trocar duplas grupos
            </button>

            <button
              type="button"
              disabled={recalculando}
              onClick={async () => {
                try {
                  setRecalculando(true);
                  const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/recalcular-classificacao`, { method: "POST" });
                  if (!res.ok) {
                    const msg = await res.json().catch(() => null);
                    throw new Error(msg?.error || "Falha ao recalcular classificação");
                  }
                  const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
                  if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
                } catch (e: any) {
                  setErro(e?.message || "Erro inesperado");
                } finally {
                  setRecalculando(false);
                }
              }}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {recalculando ? "Recalculando…" : "Recalcular"}
            </button>

            <button
              type="button"
              disabled={gerandoMataMata}
              onClick={async () => {
                try {
                  setGerandoMataMata(true);
                  const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/gerar-mata-mata`, { method: "POST" });
                  const payload = (await res.json().catch(() => null)) as any;
                  if (!res.ok) throw new Error(payload?.error || "Falha ao gerar mata-mata");
                  if (payload?.fase) {
                    setFasePartidas(payload.fase);
                    await carregarPartidas(payload.fase);
                  } else {
                    await carregarPartidas();
                  }
                } catch (e: any) {
                  setErro(e?.message || "Erro inesperado");
                } finally {
                  setGerandoMataMata(false);
                }
              }}
              className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {gerandoMataMata ? "Gerando…" : "Gerar mata-mata"}
            </button>

            <button
              type="button"
              disabled={gerandoProximaFase || fasePartidas === "GRUPOS" || fasePartidas === "FINAL"}
              onClick={async () => {
                try {
                  setGerandoProximaFase(true);
                  const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/gerar-proxima-fase`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ faseAtual: fasePartidas }),
                  });
                  const payload = (await res.json().catch(() => null)) as any;
                  if (!res.ok) throw new Error(payload?.error || "Falha ao gerar próxima fase");
                  const proximaFaseDestino = (payload?.faseCriada || payload?.faseAtualizada) as string | null;
                  if (!proximaFaseDestino) {
                    throw new Error("A próxima fase ainda não está pronta. Verifique se todos os jogos da fase atual estão finalizados.");
                  }
                  setFasePartidas(proximaFaseDestino as any);
                  await carregarPartidas(proximaFaseDestino as any);
                  await carregarResultadoFinal();
                } catch (e: any) {
                  setErro(e?.message || "Erro inesperado");
                } finally {
                  setGerandoProximaFase(false);
                }
              }}
              className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              title="Força a geração ou sincronização da fase seguinte"
            >
              {gerandoProximaFase ? "Gerando…" : "Gerar próxima fase"}
            </button>

            <button
              type="button"
              disabled={resetando}
              onClick={resetarJogos}
              className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 ml-2"
              title="Excluir todos os jogos e grupos"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classificacao.length === 0 ? (
            <div className="text-sm text-slate-600">Nenhuma classificação disponível (gere grupos e/ou recalcule).</div>
          ) : (
            classificacao.map((g) => (
              <div key={g.grupoId} className="rounded-lg border border-slate-200 p-4">
                <div className="font-semibold text-slate-900 mb-3">{g.grupoNome}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100">
                        <th className="py-2 pr-3 font-medium">Equipe</th>
                        <th className="py-2 pr-3 font-medium">J</th>
                        <th className="py-2 pr-3 font-medium">V</th>
                        <th className="py-2 pr-3 font-medium">GP</th>
                        <th className="py-2 pr-3 font-medium">SG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.equipes.map((e) => (
                        <tr key={e.equipeId} className="border-b border-slate-50">
                          <td className="py-2 pr-3 font-medium text-slate-900">{e.equipeNome || e.equipeId.slice(0, 8)}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.jogosJogados}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.jogosVencidos}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.gamesPro ?? 0}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.saldoGames}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Partidas</h2>
            <p className="text-sm text-slate-600">Lance placares conforme a regra da categoria.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filtroAtletaId}
              onChange={(e) => setFiltroAtletaId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              title="Filtrar partidas por atleta"
            >
              <option value="">Todos atletas</option>
              {atletasFiltroOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            <select
              value={fasePartidas}
              onChange={(e) => setFasePartidas(e.target.value as any)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            >
              <option value="GRUPOS">GRUPOS</option>
              <option value="OITAVAS">OITAVAS</option>
              <option value="QUARTAS">QUARTAS</option>
              <option value="SEMI">SEMI</option>
              <option value="FINAL">FINAL</option>
            </select>
            <button
              type="button"
              onClick={() => carregarPartidas()}
              disabled={carregandoPartidas}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {carregandoPartidas ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </div>

          {partidasFiltradas.length === 0 ? (
            <div className="py-10 text-center text-slate-500">Nenhuma partida encontrada.</div>
          ) : fasePartidas === "GRUPOS" ? (
            <div className="mt-4 space-y-6">
              {partidasAgrupadasPorGrupo.map((grupo) => (
                <section key={grupo.grupoNome} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{grupo.grupoNome}</h3>
                    <span className="text-xs font-medium text-slate-500">{grupo.partidas.length} jogo(s)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {grupo.partidas.map((p) => renderPartidaCard(p))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {partidasFiltradas.map((p) => renderPartidaCard(p))}
            </div>
          )}
      </div>

      {editPartidaId &&
        (() => {
          const partida = partidas.find((p) => p.id === editPartidaId);
          if (!partida) return null;
          const melhorDe = config?.regrasPartida?.melhorDe ?? 1;
          const superTie = config?.regrasPartida?.superTiebreakDecisivo?.habilitado ?? false;
          const tbHabilitado = config?.regrasPartida?.tiebreak?.habilitado ?? true;
          const tbEm = config?.regrasPartida?.tiebreak?.em ?? (config?.regrasPartida?.gamesPorSet ?? 6);
          const s1aN = Number(formPlacar.s1a);
          const s1bN = Number(formPlacar.s1b);
          const s2aN = Number(formPlacar.s2a);
          const s2bN = Number(formPlacar.s2b);
          const isTbScore = (a: number, b: number) =>
            Number.isFinite(a) && Number.isFinite(b) && ((a === tbEm && b === tbEm) || (Math.max(a, b) === tbEm + 1 && Math.min(a, b) === tbEm));

          const showTb1 = tbHabilitado && (Boolean(formPlacar.tb1a.trim() || formPlacar.tb1b.trim()) || isTbScore(s1aN, s1bN));
          const showTb2 = tbHabilitado && (Boolean(formPlacar.tb2a.trim() || formPlacar.tb2b.trim()) || isTbScore(s2aN, s2bN));

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditPartidaId(null)}>
              <div
                className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg max-h-[85vh] overflow-y-auto"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider">Lançar placar</div>
                      <div className="text-lg font-bold text-slate-900">
                        {partida.equipeANome || partida.equipeAId.slice(0, 8)} <span className="text-slate-400">vs</span>{" "}
                        {partida.equipeBNome || partida.equipeBId.slice(0, 8)}
                      </div>
                    </div>
                    <button type="button" onClick={() => setEditPartidaId(null)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                      <X className="h-4 w-4" />
                      Fechar
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Link Foto</label>
                        <input
                          type="text"
                          value={fotoUrl}
                          onChange={(e) => setFotoUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Link Transmissão</label>
                        <input
                          type="text"
                          value={transmissaoUrl}
                          onChange={(e) => setTransmissaoUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Set 1</label>
                      <div className="flex items-center gap-2">
                        <input value={formPlacar.s1a} onChange={(e) => setFormPlacar((p) => ({ ...p, s1a: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                        <span className="text-slate-400">x</span>
                        <input value={formPlacar.s1b} onChange={(e) => setFormPlacar((p) => ({ ...p, s1b: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                      </div>
                      {showTb1 && (
                        <div className="pt-2">
                          <div className="text-xs text-slate-500 mb-1">Tie-break</div>
                          <div className="flex items-center gap-2">
                            <input value={formPlacar.tb1a} onChange={(e) => setFormPlacar((p) => ({ ...p, tb1a: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                            <span className="text-slate-400">x</span>
                            <input value={formPlacar.tb1b} onChange={(e) => setFormPlacar((p) => ({ ...p, tb1b: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                          </div>
                        </div>
                      )}
                    </div>

                    {melhorDe === 3 && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Set 2</label>
                        <div className="flex items-center gap-2">
                          <input value={formPlacar.s2a} onChange={(e) => setFormPlacar((p) => ({ ...p, s2a: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                          <span className="text-slate-400">x</span>
                          <input value={formPlacar.s2b} onChange={(e) => setFormPlacar((p) => ({ ...p, s2b: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                        </div>
                        {showTb2 && (
                          <div className="pt-2">
                            <div className="text-xs text-slate-500 mb-1">Tie-break</div>
                            <div className="flex items-center gap-2">
                              <input value={formPlacar.tb2a} onChange={(e) => setFormPlacar((p) => ({ ...p, tb2a: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                              <span className="text-slate-400">x</span>
                              <input value={formPlacar.tb2b} onChange={(e) => setFormPlacar((p) => ({ ...p, tb2b: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {melhorDe === 3 && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">{superTie ? "Super tie" : "Set 3"}</label>
                        <div className="flex items-center gap-2">
                          <input value={formPlacar.s3a} onChange={(e) => setFormPlacar((p) => ({ ...p, s3a: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                          <span className="text-slate-400">x</span>
                          <input value={formPlacar.s3b} onChange={(e) => setFormPlacar((p) => ({ ...p, s3b: e.target.value }))} type="number" className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setEditPartidaId(null)} className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Cancelar
                    </button>
                    {(partida.status === "FINALIZADA" || partida.status === "WO") && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setSalvandoPartida(true);
                            setErro(null);
                            const res = await fetch(
                              `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partida.id}/cancelar-placar`,
                              { method: "POST" }
                            );
                            const payload = (await res.json().catch(() => null)) as any;
                            if (!res.ok) throw new Error(payload?.error || "Falha ao cancelar placar");
                            if (fasePartidas === "GRUPOS") {
                              await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
                              const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
                              if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
                            }
                            await carregarPartidas();
                            await carregarResultadoFinal();
                            setEditPartidaId(null);
                          } catch (e: any) {
                            setErro(e?.message || "Erro inesperado");
                          } finally {
                            setSalvandoPartida(false);
                          }
                        }}
                        disabled={salvandoPartida}
                        className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancelar placar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => salvarPlacar(partida)}
                      disabled={salvandoPartida}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {salvandoPartida ? "Salvando…" : "Salvar placar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {editConfrontoId &&
        (() => {
          const partida = partidas.find((p) => p.id === editConfrontoId);
          if (!partida) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditConfrontoId(null)}>
              <div
                className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg max-h-[85vh] overflow-y-auto"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider">Alterar confronto</div>
                      <div className="text-lg font-bold text-slate-900">
                        {partida.equipeANome || partida.equipeAId.slice(0, 8)} <span className="text-slate-400">vs</span>{" "}
                        {partida.equipeBNome || partida.equipeBId.slice(0, 8)}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        Disponível para manutenção da chave antes de qualquer jogo da fase começar.
                      </div>
                    </div>
                    <button type="button" onClick={() => setEditConfrontoId(null)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                      <X className="h-4 w-4" />
                      Fechar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Dupla A</label>
                      <select
                        value={confrontoEquipeAId}
                        onChange={(e) => setConfrontoEquipeAId(e.target.value)}
                        disabled={carregandoEquipes}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white disabled:opacity-50"
                      >
                        {equipes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Dupla B</label>
                      <select
                        value={confrontoEquipeBId}
                        onChange={(e) => setConfrontoEquipeBId(e.target.value)}
                        disabled={carregandoEquipes}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white disabled:opacity-50"
                      >
                        {equipes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {partida.fase !== "GRUPOS" && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm text-slate-700">
                        Modo manutenção: permite reorganizar confrontos da fase mesmo com repetição temporária de duplas, desde que nenhum jogo da fase tenha começado.
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={modoManutencaoConfronto}
                          onChange={(e) => setModoManutencaoConfronto(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Ativar
                      </label>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setEditConfrontoId(null)} className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setSalvandoConfronto(true);
                          setErro(null);
                          const res = await fetch(
                            `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partida.id}/alterar-confronto`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                equipeAId: confrontoEquipeAId,
                                equipeBId: confrontoEquipeBId,
                                force: partida.fase !== "GRUPOS" && modoManutencaoConfronto,
                              }),
                            }
                          );
                          const payload = (await res.json().catch(() => null)) as any;
                          if (!res.ok) throw new Error(payload?.error || "Falha ao alterar confronto");
                          await carregarPartidas();
                          await carregarResultadoFinal();
                          setEditConfrontoId(null);
                        } catch (e: any) {
                          setErro(e?.message || "Erro inesperado");
                        } finally {
                          setSalvandoConfronto(false);
                        }
                      }}
                      disabled={salvandoConfronto || carregandoEquipes || !confrontoEquipeAId || !confrontoEquipeBId || confrontoEquipeAId === confrontoEquipeBId}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {salvandoConfronto ? "Salvando…" : "Salvar confronto"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {trocaGruposOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setTrocaGruposOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Manutenção dos grupos</div>
                  <div className="text-lg font-bold text-slate-900">Trocar duplas entre grupos</div>
                  <div className="text-sm text-slate-600 mt-1">
                    O sistema vai trocar as duplas selecionadas entre os grupos e regerar os jogos da fase de grupos.
                  </div>
                </div>
                <button type="button" onClick={() => setTrocaGruposOpen(false)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                  <X className="h-4 w-4" />
                  Fechar
                </button>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Use esse recurso antes de qualquer resultado nos grupos. Ao confirmar, os jogos e rodadas da fase de grupos são recriados.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Dupla 1</label>
                  <select
                    value={trocaGrupoEquipeAId}
                    onChange={(e) => setTrocaGrupoEquipeAId(e.target.value)}
                    disabled={salvandoTrocaGrupos}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white disabled:opacity-50"
                  >
                    {equipesDosGrupos.map((e) => (
                      <option key={e.equipeId} value={e.equipeId}>
                        {e.grupoNome} - {e.equipeNome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Dupla 2</label>
                  <select
                    value={trocaGrupoEquipeBId}
                    onChange={(e) => setTrocaGrupoEquipeBId(e.target.value)}
                    disabled={salvandoTrocaGrupos}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white disabled:opacity-50"
                  >
                    {equipesDosGrupos.map((e) => (
                      <option key={e.equipeId} value={e.equipeId}>
                        {e.grupoNome} - {e.equipeNome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTrocaGruposOpen(false)}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setSalvandoTrocaGrupos(true);
                      setErro(null);
                      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/grupos/trocar-equipes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          equipeOrigemId: trocaGrupoEquipeAId,
                          equipeDestinoId: trocaGrupoEquipeBId,
                        }),
                      });
                      const payload = (await res.json().catch(() => null)) as any;
                      if (!res.ok) throw new Error(payload?.error || "Falha ao trocar duplas entre grupos");
                      const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
                      if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
                      setFasePartidas("GRUPOS");
                      await carregarPartidas("GRUPOS");
                      setTrocaGruposOpen(false);
                    } catch (e: any) {
                      setErro(e?.message || "Erro inesperado");
                    } finally {
                      setSalvandoTrocaGrupos(false);
                    }
                  }}
                  disabled={!trocaGrupoEquipeAId || !trocaGrupoEquipeBId || trocaGrupoEquipeAId === trocaGrupoEquipeBId || salvandoTrocaGrupos}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {salvandoTrocaGrupos ? "Salvando..." : "Trocar e regerar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {montagemGruposOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setMontagemGruposOpen(false)}>
          <div
            className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-lg max-h-[85vh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Montagem manual</div>
                  <div className="text-lg font-bold text-slate-900">Definir grupo de cada dupla</div>
                  <div className="text-sm text-slate-600 mt-1">
                    Preencha o grupo ao lado de cada dupla e confirme para recriar grupos e jogos sem sorteio.
                  </div>
                </div>
                <button type="button" onClick={() => setMontagemGruposOpen(false)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                  <X className="h-4 w-4" />
                  Fechar
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-900">Validação de quantidades</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                  {gruposEsperadosMontagem.map((grupo) => {
                    const valido = grupo.atual === grupo.esperado;
                    return (
                      <div key={grupo.nome} className={`rounded-md border px-3 py-2 ${valido ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                        <div className="text-sm font-semibold text-slate-900">{grupo.nome}</div>
                        <div className="text-xs text-slate-600">Esperado: {grupo.esperado}</div>
                        <div className={`text-xs font-semibold ${valido ? "text-emerald-700" : "text-amber-700"}`}>Atual: {grupo.atual}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-semibold text-slate-700">Dupla</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Atletas</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Grupo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {montagemGruposLinhas.map((linha) => (
                      <tr key={linha.equipeId} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{linha.equipeNome}</td>
                        <td className="px-4 py-3 text-slate-600">{linha.atletas.length > 0 ? linha.atletas.join(" / ") : "-"}</td>
                        <td className="px-4 py-3">
                          <select
                            value={linha.grupoNome}
                            onChange={(e) =>
                              setMontagemGruposLinhas((prev) =>
                                prev.map((item) => (item.equipeId === linha.equipeId ? { ...item, grupoNome: e.target.value } : item))
                              )
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                          >
                            <option value="">Selecione</option>
                            {gruposEsperadosMontagem.map((grupo) => (
                              <option key={grupo.nome} value={grupo.nome}>
                                {grupo.nome}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMontagemGruposOpen(false)}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarMontagemManualGrupos}
                  disabled={salvandoMontagemGrupos || gruposEsperadosMontagem.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {salvandoMontagemGrupos ? "Confirmando…" : "Confirmar grupos"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
