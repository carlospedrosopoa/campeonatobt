"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Banknote, CalendarClock, Gamepad2, ImageIcon, Network, Pencil, PlusCircle, RefreshCcw, Save, Settings, X } from "lucide-react";
import { gerarCardPartidaAdmin } from "@/lib/match-card-client";
import { CategoriaHeader } from "@/components/admin/categoria-header";

type Categoria = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
};

type FaseColuna = "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL";
type Fase = FaseColuna | "TERCEIRO_LUGAR";

type GrupoClassificacao = {
  grupoId: string;
  grupoNome: string;
  equipes: {
    equipeId: string;
    equipeNome: string;
    pontos: number;
    jogosJogados: number;
    jogosVencidos: number;
    jogosPerdidos: number;
    saldoGames: number;
    gamesPro?: number;
    setsPro?: number;
  }[];
};

type CategoriaConfig = {
  mataMata?: {
    estrutura?: "PADRAO" | "SUPER_CAMPEONATO_6" | "GRUPOS_6_MELHORES_PRIMEIROS_BYE" | "GRUPOS_8_CRUZAMENTO_PADRAO" | "GRUPOS_10_CRUZAMENTO_PADRAO";
  };
};

type Inscricao = {
  status: string;
  equipe: { id: string; nome: string | null };
};

type Partida = {
  id: string;
  fase: Fase;
  status: string;
  equipeAId: string;
  equipeBId: string;
  equipeANome: string | null;
  equipeBNome: string | null;
  vencedorId: string | null;
  placarA: number;
  placarB: number;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  rodadaNome?: string | null;
  rodadaNumero?: number | null;
  arenaId?: string | null;
  arenaNome?: string | null;
  quadra?: string | null;
  dataHorario?: string | null;
  dataLimite?: string | null;
  fotoUrl?: string | null;
  equipeAAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
  equipeBAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
};

function toLocalDateInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resumoAgenda(p: Partida) {
  const partes: string[] = [];
  if (p.dataHorario) {
    const d = new Date(p.dataHorario);
    if (!Number.isNaN(d.getTime())) {
      partes.push(
        d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      );
    }
  }
  if (p.quadra) partes.push(`Quadra ${p.quadra}`);
  if (p.arenaNome) partes.push(p.arenaNome);
  return partes.join(" · ");
}

function partidaIniciada(p: Partida) {
  if (p.status !== "AGENDADA") return true;
  if (p.vencedorId) return true;
  if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
  if (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0) return true;
  return false;
}

function formatPlacar(detalhes: Partida["detalhesPlacar"]) {
  if (!detalhes || detalhes.length === 0) return "-";
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

function nomeFase(f: Fase) {
  if (f === "OITAVAS") return "Oitavas";
  if (f === "QUARTAS") return "Quartas";
  if (f === "SEMI") return "Semifinal";
  if (f === "TERCEIRO_LUGAR") return "3º lugar";
  return "Final";
}

function placeholderMatch(fase: FaseColuna, index: number): Partida {
  return {
    id: `placeholder:${fase}:${index}`,
    fase,
    status: "AGUARDANDO",
    equipeAId: "aguardando",
    equipeBId: "aguardando",
    equipeANome: "Aguardando",
    equipeBNome: "Aguardando",
    vencedorId: null,
    placarA: 0,
    placarB: 0,
    detalhesPlacar: null,
  };
}

export default function AdminCategoriaChavePage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [superCampeonato, setSuperCampeonato] = useState(false);
  const [mataMataEstrutura, setMataMataEstrutura] = useState<
    "PADRAO" | "SUPER_CAMPEONATO_6" | "GRUPOS_6_MELHORES_PRIMEIROS_BYE" | "GRUPOS_8_CRUZAMENTO_PADRAO" | "GRUPOS_10_CRUZAMENTO_PADRAO"
  >("PADRAO");
  const [classificacao, setClassificacao] = useState<GrupoClassificacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);
  const [carregandoEquipes, setCarregandoEquipes] = useState(false);
  const [editConfrontoId, setEditConfrontoId] = useState<string | null>(null);
  const [confrontoEquipeAId, setConfrontoEquipeAId] = useState("");
  const [confrontoEquipeBId, setConfrontoEquipeBId] = useState("");
  const [salvandoConfronto, setSalvandoConfronto] = useState(false);
  const [substituicaoEquipeOrigemId, setSubstituicaoEquipeOrigemId] = useState("");
  const [substituicaoEquipeDestinoId, setSubstituicaoEquipeDestinoId] = useState("");
  const [substituindoEquipe, setSubstituindoEquipe] = useState(false);
  const [modoManutencaoConfronto, setModoManutencaoConfronto] = useState(false);
  const [torneioInfo, setTorneioInfo] = useState<{
    nome: string;
    templateUrl: string | null;
    cardApenasComFotos: boolean;
    layoutCards: string | null;
  }>({ nome: "Torneio", templateUrl: null, cardApenasComFotos: false, layoutCards: null });
  const [gerandoCardId, setGerandoCardId] = useState<string | null>(null);
  const [editAgendamentoId, setEditAgendamentoId] = useState<string | null>(null);
  const [arenas, setArenas] = useState<{ id: string; nome: string }[]>([]);
  const [carregandoArenas, setCarregandoArenas] = useState(false);
  const [agendaArenaId, setAgendaArenaId] = useState("");
  const [agendaQuadra, setAgendaQuadra] = useState("");
  const [agendaDataHorario, setAgendaDataHorario] = useState("");
  const [agendaDataLimite, setAgendaDataLimite] = useState("");
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);
  const [montagemAberta, setMontagemAberta] = useState(false);
  const [faseMontagem, setFaseMontagem] = useState<FaseColuna>("OITAVAS");
  const [limparPosterioresMontagem, setLimparPosterioresMontagem] = useState(true);
  const [qtdConfrontosMontagem, setQtdConfrontosMontagem] = useState(4);
  const [confrontosMontagem, setConfrontosMontagem] = useState<Array<{ equipeAId: string; equipeBId: string }>>([]);
  const [salvandoMontagem, setSalvandoMontagem] = useState(false);
  const [erroMontagem, setErroMontagem] = useState<string | null>(null);

  const [jogosPorFase, setJogosPorFase] = useState<Record<Fase, Partida[]>>({
    OITAVAS: [],
    QUARTAS: [],
    SEMI: [],
    FINAL: [],
    TERCEIRO_LUGAR: [],
  });

  async function carregarCategoria() {
    const resCat = await fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" });
    if (!resCat.ok) {
      const msg = await resCat.json().catch(() => null);
      throw new Error(msg?.error || "Falha ao carregar categoria");
    }
    const cats = (await resCat.json()) as Categoria[];
    return cats.find((c) => c.id === categoriaId) ?? null;
  }

  async function carregarChave() {
    const fases: Fase[] = ["OITAVAS", "QUARTAS", "SEMI", "FINAL", "TERCEIRO_LUGAR"];
    const results = await Promise.all(
      fases.map(async (f): Promise<[Fase, Partida[]]> => {
        const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=${f}`, { cache: "no-store" });
        if (!res.ok) return [f, []];
        const rows = (await res.json()) as Partida[];
        const sorted = rows.slice().sort((a, b) => a.id.localeCompare(b.id));
        return [f, sorted];
      })
    );

    const map = { OITAVAS: [], QUARTAS: [], SEMI: [], FINAL: [], TERCEIRO_LUGAR: [] } as Record<Fase, Partida[]>;
    for (const [f, rows] of results) map[f] = rows;
    setJogosPorFase(map);
  }

  async function carregarTorneioSuper() {
    const res = await fetch(`/api/v1/torneios/${slug}`, { cache: "no-store" });
    if (!res.ok) return false;
    const t = (await res.json()) as any;
    setTorneioInfo({
      nome: String(t?.nome || "Torneio"),
      templateUrl: (t?.templateUrl as string | null | undefined) ?? null,
      cardApenasComFotos: Boolean(t?.cardApenasComFotos),
      layoutCards: (t?.layoutCards as string | null | undefined) ?? null,
    });
    return Boolean(t?.superCampeonato);
  }

  async function carregarClassificacao() {
    const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
    if (!res.ok) return [];
    const rows = (await res.json()) as GrupoClassificacao[];
    return Array.isArray(rows) ? rows : [];
  }

  async function carregarConfig() {
    const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/config`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as CategoriaConfig | null;
  }

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const cat = await carregarCategoria();
        if (!ativo) return;
        setCategoria(cat);
        const [isSuper, classRows, configCategoria] = await Promise.all([carregarTorneioSuper(), carregarClassificacao(), carregarConfig()]);
        if (!ativo) return;
        setSuperCampeonato(isSuper);
        setMataMataEstrutura(configCategoria?.mataMata?.estrutura ?? "PADRAO");
        setClassificacao(classRows);
        await carregarChave();
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
  }, [slug, categoriaId]);

  const superTop2 = useMemo(() => {
    if (!superCampeonato) return null;
    const g0 = classificacao[0];
    const a = g0?.equipes?.[0];
    const b = g0?.equipes?.[1];
    if (!a || !b) return null;
    return { s1: a, s2: b };
  }, [classificacao, superCampeonato]);

  const gruposTop2 = useMemo(() => {
    if (superCampeonato || mataMataEstrutura !== "GRUPOS_6_MELHORES_PRIMEIROS_BYE") return null;
    const primeiros = classificacao
      .map((grupo) => grupo.equipes?.[0])
      .filter(Boolean)
      .sort((a, b) => {
        const vitoriasA = a?.jogosVencidos ?? 0;
        const vitoriasB = b?.jogosVencidos ?? 0;
        if (vitoriasB !== vitoriasA) return vitoriasB - vitoriasA;
        const saldoA = a?.saldoGames ?? 0;
        const saldoB = b?.saldoGames ?? 0;
        if (saldoB !== saldoA) return saldoB - saldoA;
        const gamesProA = a?.gamesPro ?? 0;
        const gamesProB = b?.gamesPro ?? 0;
        if (gamesProB !== gamesProA) return gamesProB - gamesProA;
        return String(a?.equipeId || "").localeCompare(String(b?.equipeId || ""));
      });
    if (primeiros.length < 2) return null;
    return { s1: primeiros[0], s2: primeiros[1] };
  }, [classificacao, superCampeonato, mataMataEstrutura]);

  const fasesView = useMemo(() => {
    const base =
      jogosPorFase.OITAVAS.length > 0
        ? "OITAVAS"
        : jogosPorFase.QUARTAS.length > 0
          ? "QUARTAS"
          : jogosPorFase.SEMI.length > 0
            ? "SEMI"
            : jogosPorFase.FINAL.length > 0
              ? "FINAL"
              : null;

    if (!base) return { OITAVAS: [] as Partida[], QUARTAS: [] as Partida[], SEMI: [] as Partida[], FINAL: [] as Partida[] };

    const baseCount = jogosPorFase[base as Fase].length;
    const expected: Record<FaseColuna, number> = { OITAVAS: 0, QUARTAS: 0, SEMI: 0, FINAL: 0 };

    if (base === "OITAVAS") {
      expected.OITAVAS = baseCount;
      expected.QUARTAS = Math.max(0, Math.floor(baseCount / 2));
      expected.SEMI = Math.max(0, Math.floor(expected.QUARTAS / 2));
      expected.FINAL = expected.SEMI > 0 ? 1 : 0;
    } else if (base === "QUARTAS") {
      expected.QUARTAS = baseCount;
      if ((superCampeonato || mataMataEstrutura === "GRUPOS_6_MELHORES_PRIMEIROS_BYE") && baseCount === 2) {
        expected.SEMI = 2;
        expected.FINAL = 1;
      } else {
        expected.SEMI = Math.max(0, Math.floor(baseCount / 2));
        expected.FINAL = expected.SEMI > 0 ? 1 : 0;
      }
    } else if (base === "SEMI") {
      expected.SEMI = baseCount;
      expected.FINAL = expected.SEMI > 0 ? 1 : 0;
    } else {
      expected.FINAL = baseCount;
    }

    const out: Record<FaseColuna, Partida[]> = {
      OITAVAS: jogosPorFase.OITAVAS,
      QUARTAS: jogosPorFase.QUARTAS,
      SEMI: jogosPorFase.SEMI,
      FINAL: jogosPorFase.FINAL,
    };
    const fill = (fase: FaseColuna) => {
      const want = expected[fase];
      if (want <= 0) return;
      const cur = out[fase] ?? [];
      if (cur.length >= want) return;
      const extras = Array.from({ length: want - cur.length }, (_, i) => placeholderMatch(fase, cur.length + i + 1));
      out[fase] = [...cur, ...extras];
    };

    fill("OITAVAS");
    fill("QUARTAS");
    fill("SEMI");
    fill("FINAL");

    if ((superCampeonato || mataMataEstrutura === "GRUPOS_6_MELHORES_PRIMEIROS_BYE") && base === "QUARTAS" && expected.SEMI === 2 && out.SEMI.length === 2) {
      const semifinalistasComBye = superCampeonato ? superTop2 : gruposTop2;
      const s1 = semifinalistasComBye?.s1;
      const s2 = semifinalistasComBye?.s2;
      if (s1 && out.SEMI[0]?.id.startsWith("placeholder:")) {
        out.SEMI[0] = {
          ...out.SEMI[0],
          equipeAId: s1.equipeId,
          equipeANome: s1.equipeNome || "1º colocado",
          equipeBId: "aguardando",
          equipeBNome: "Aguardando vencedor das quartas",
        };
      }
      if (s2 && out.SEMI[1]?.id.startsWith("placeholder:")) {
        out.SEMI[1] = {
          ...out.SEMI[1],
          equipeAId: s2.equipeId,
          equipeANome: s2.equipeNome || "2º colocado",
          equipeBId: "aguardando",
          equipeBNome: "Aguardando vencedor das quartas",
        };
      }
    }

    return out;
  }, [jogosPorFase, superCampeonato, superTop2, gruposTop2, mataMataEstrutura]);

  const jogosTerceiroLugar = jogosPorFase.TERCEIRO_LUGAR ?? [];

  const partidaEditando = useMemo(() => {
    if (!editConfrontoId) return null;
    return (Object.values(jogosPorFase).flat() as Partida[]).find((p) => p.id === editConfrontoId) ?? null;
  }, [editConfrontoId, jogosPorFase]);

  const equipesDaFaseEditando = useMemo(() => {
    if (!partidaEditando) return [];
    const jogos = jogosPorFase[partidaEditando.fase] ?? [];
    const mapa = new Map<string, string>();
    for (const jogo of jogos) {
      if (jogo.equipeAId && !jogo.equipeAId.startsWith("aguardando")) {
        mapa.set(jogo.equipeAId, jogo.equipeANome || jogo.equipeAId.slice(0, 8));
      }
      if (jogo.equipeBId && !jogo.equipeBId.startsWith("aguardando")) {
        mapa.set(jogo.equipeBId, jogo.equipeBNome || jogo.equipeBId.slice(0, 8));
      }
    }
    return Array.from(mapa.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [partidaEditando, jogosPorFase]);

  function atualizarPartidaLocal(id: string, patch: Partial<Partida>) {
    setJogosPorFase((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next) as Fase[]) next[k] = next[k].map((it) => (it.id === id ? { ...it, ...patch } : it));
      return next;
    });
  }

  async function gerarCardPartida(p: Partida) {
    try {
      setErro(null);
      if ((p.fotoUrl || "").trim()) {
        window.open(p.fotoUrl as string, "_blank");
        return;
      }
      setGerandoCardId(p.id);
      const result = await gerarCardPartidaAdmin({
        torneioNome: torneioInfo.nome,
        categoriaNome: categoria?.nome || "Categoria",
        cardApenasComFotos: torneioInfo.cardApenasComFotos,
        layout: torneioInfo.layoutCards,
        templateUrl: torneioInfo.templateUrl,
        syncFotosUrl: `/api/public/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}/sincronizar-fotos`,
        salvarNoGcs: true,
        uploadFolder: `campeonatos/cards/partidas/${slug}`,
        persistFotoUrlApi: `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}`,
        partida: {
          id: p.id,
          fase: p.fase,
          placarA: p.placarA ?? 0,
          placarB: p.placarB ?? 0,
          detalhesPlacar: p.detalhesPlacar ?? null,
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
      if (url) atualizarPartidaLocal(p.id, { fotoUrl: url });
    } catch (e: any) {
      setErro(e?.message || "Não foi possível gerar o card da partida");
    } finally {
      setGerandoCardId(null);
    }
  }

  async function abrirAgendamento(p: Partida) {
    setEditAgendamentoId(p.id);
    setAgendaArenaId(p.arenaId ?? "");
    setAgendaQuadra((p.quadra ?? "").toString());
    setAgendaDataHorario(toLocalDateTimeInput(p.dataHorario ?? null));
    setAgendaDataLimite(toLocalDateInput(p.dataLimite ?? null));
    if (arenas.length > 0) return;
    try {
      setCarregandoArenas(true);
      const res = await fetch(`/api/v1/torneios/${slug}/arenas`, { cache: "no-store" });
      if (!res.ok) return;
      const rows = (await res.json()) as any[];
      setArenas(
        rows
          .map((a) => ({ id: a.id as string, nome: (a.nome as string) ?? "" }))
          .filter((a) => a.id && a.nome)
          .sort((a, b) => a.nome.localeCompare(b.nome))
      );
    } finally {
      setCarregandoArenas(false);
    }
  }

  async function salvarAgendamento(partidaId: string) {
    try {
      setSalvandoAgendamento(true);
      setErro(null);
      if (agendaDataHorario.trim() && !agendaArenaId) throw new Error("Selecione uma arena para agendar a partida");
      const toIsoDateTime = (v: string) => (v.trim() ? new Date(v).toISOString() : null);
      const toIsoDate = (v: string) => (v.trim() ? new Date(`${v}T00:00:00`).toISOString() : null);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partidaId}/agendamento`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arenaId: agendaArenaId || null,
          quadra: agendaQuadra.trim() || null,
          dataHorario: toIsoDateTime(agendaDataHorario),
          dataLimite: toIsoDate(agendaDataLimite),
        }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar agendamento");
      await carregarChave();
      setEditAgendamentoId(null);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoAgendamento(false);
    }
  }

  function renderAcoesJogo(p: Partida, variante: "mobile" | "desktop") {
    const agenda = resumoAgenda(p);
    const btn =
      "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
    return (
      <div className={variante === "mobile" ? "mt-3 space-y-2" : "mt-3 space-y-2"}>
        <div className={`flex items-center gap-1.5 text-xs ${agenda ? "text-slate-600" : "text-amber-700"}`}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{agenda || "Sem data e horário"}</span>
        </div>
        <div className={variante === "mobile" ? "grid grid-cols-2 gap-2" : "flex flex-wrap justify-end gap-2"}>
          <button type="button" onClick={() => void gerarCardPartida(p)} disabled={gerandoCardId === p.id} className={btn}>
            <ImageIcon className="h-3.5 w-3.5" />
            {gerandoCardId === p.id ? "Gerando…" : "Card"}
          </button>
          <button type="button" onClick={() => void abrirAgendamento(p)} className={btn}>
            <CalendarClock className="h-3.5 w-3.5" />
            Agendar
          </button>
          <button
            type="button"
            onClick={() => void abrirAlterarConfronto(p)}
            className={variante === "mobile" ? `${btn} col-span-2` : btn}
          >
            <Pencil className="h-3.5 w-3.5" />
            Alterar confronto
          </button>
        </div>
      </div>
    );
  }

  async function abrirAlterarConfronto(p: Partida) {
    setEditConfrontoId(p.id);
    setConfrontoEquipeAId(p.equipeAId);
    setConfrontoEquipeBId(p.equipeBId);
    setSubstituicaoEquipeOrigemId(p.equipeAId);
    setSubstituicaoEquipeDestinoId("");
    setModoManutencaoConfronto(false);
    if (equipes.length > 0) return;
    await carregarEquipesAprovadas();
  }

  async function carregarEquipesAprovadas() {
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

  function sugestaoQtdConfrontos(fase: FaseColuna) {
    if (fase === "OITAVAS") return 4;
    if (fase === "QUARTAS") return 2;
    if (fase === "SEMI") return 2;
    return 1;
  }

  async function abrirMontagemManual(fase: FaseColuna) {
    setErroMontagem(null);
    setFaseMontagem(fase);
    setLimparPosterioresMontagem(true);
    const existentes = jogosPorFase[fase] ?? [];
    const qtd = existentes.length > 0 ? existentes.length : sugestaoQtdConfrontos(fase);
    setQtdConfrontosMontagem(qtd);
    setConfrontosMontagem(
      existentes.length > 0
        ? existentes.map((p) => ({ equipeAId: p.equipeAId, equipeBId: p.equipeBId }))
        : Array.from({ length: qtd }, () => ({ equipeAId: "", equipeBId: "" }))
    );
    setMontagemAberta(true);
    await carregarEquipesAprovadas();
  }

  function fecharMontagemManual() {
    if (salvandoMontagem) return;
    setMontagemAberta(false);
    setErroMontagem(null);
  }

  function ajustarQtdConfrontos(nextQtd: number) {
    const qtd = Math.max(1, Math.min(8, nextQtd));
    setQtdConfrontosMontagem(qtd);
    setConfrontosMontagem((prev) => {
      const current = Array.isArray(prev) ? prev.slice() : [];
      if (current.length === qtd) return current;
      if (current.length > qtd) return current.slice(0, qtd);
      const extra = Array.from({ length: qtd - current.length }, () => ({ equipeAId: "", equipeBId: "" }));
      return [...current, ...extra];
    });
  }

  function validarMontagem(confrontos: Array<{ equipeAId: string; equipeBId: string }>) {
    const usados = new Set<string>();
    for (const c of confrontos) {
      const a = String(c.equipeAId || "").trim();
      const b = String(c.equipeBId || "").trim();
      if (!a || !b) return "Preencha Dupla A e Dupla B em todos os confrontos.";
      if (a === b) return "Dupla A e Dupla B precisam ser diferentes em cada confronto.";
      if (usados.has(a) || usados.has(b)) return "Uma mesma dupla não pode aparecer em mais de um confronto nesta fase.";
      usados.add(a);
      usados.add(b);
    }
    return null;
  }

  async function confirmarMontagemManual() {
    setErroMontagem(null);
    const erroLocal = validarMontagem(confrontosMontagem);
    if (erroLocal) {
      setErroMontagem(erroLocal);
      return;
    }

    try {
      setSalvandoMontagem(true);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/montar-mata-mata-fase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fase: faseMontagem,
          confrontos: confrontosMontagem,
          limparPosteriores: limparPosterioresMontagem,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Falha ao montar a fase manualmente");
      }

      await carregarChave();
      setMontagemAberta(false);
    } catch (e: any) {
      setErroMontagem(e?.message || "Erro inesperado");
    } finally {
      setSalvandoMontagem(false);
    }
  }

  if (carregando) return <div className="text-sm text-slate-600">Carregando…</div>;

  return (
    <div className="space-y-6">
      <CategoriaHeader
        slug={slug}
        categoriaId={categoriaId}
        categoria={categoria}
        ativa="chave"
        resumo="Acompanhamento do mata-mata em colunas."
        acoes={
          <>
              <button
                type="button"
                disabled={atualizando}
                onClick={async () => {
                  try {
                    setAtualizando(true);
                    const [isSuper, classRows] = await Promise.all([carregarTorneioSuper(), carregarClassificacao()]);
                    setSuperCampeonato(isSuper);
                    setClassificacao(classRows);
                    await carregarChave();
                  } finally {
                    setAtualizando(false);
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 lg:w-auto"
              >
                <RefreshCcw className="h-4 w-4" />
                {atualizando ? "Atualizando…" : "Atualizar"}
              </button>
              <button
                type="button"
                onClick={() => void abrirMontagemManual("OITAVAS")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 lg:w-auto"
              >
                <PlusCircle className="h-4 w-4" />
                Montar fase manual
              </button>
          </>
        }
      />

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="space-y-4 md:hidden">
        {(["OITAVAS", "QUARTAS", "SEMI", "FINAL"] as FaseColuna[]).map((fase) => {
          const jogos = fasesView[fase];
          const visible = fase === "FINAL" ? jogos.length > 0 || jogosTerceiroLugar.length > 0 : jogos.length > 0;

          return (
            <section key={`${fase}:mobile`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold uppercase tracking-wide text-slate-700">{nomeFase(fase)}</div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {visible ? `${jogos.length + (fase === "FINAL" ? jogosTerceiroLugar.length : 0)} jogo(s)` : "Sem jogos"}
                </div>
              </div>

              {!visible ? (
                <div className="mt-4 text-sm text-slate-500">Sem jogos nesta fase.</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {jogos.map((p) => {
                    const winnerA = p.vencedorId && p.vencedorId === p.equipeAId;
                    const winnerB = p.vencedorId && p.vencedorId === p.equipeBId;
                    return (
                      <div key={`${p.id}:mobile`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-semibold ${winnerA ? "text-slate-900" : "text-slate-700"}`}>
                              {p.equipeANome || p.equipeAId.slice(0, 8)}
                            </div>
                            <div className={`mt-1 truncate text-sm font-semibold ${winnerB ? "text-slate-900" : "text-slate-700"}`}>
                              {p.equipeBNome || p.equipeBId.slice(0, 8)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900">{p.status === "AGUARDANDO" ? "-" : formatPlacar(p.detalhesPlacar)}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{p.status}</div>
                          </div>
                        </div>

                        {!p.id.startsWith("placeholder:") ? renderAcoesJogo(p, "mobile") : null}
                      </div>
                    );
                  })}
                  {fase === "FINAL" && jogosTerceiroLugar.length > 0 ? (
                    <div className="space-y-3 pt-2">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{nomeFase("TERCEIRO_LUGAR")}</div>
                      {jogosTerceiroLugar.map((p) => {
                        const winnerA = p.vencedorId && p.vencedorId === p.equipeAId;
                        const winnerB = p.vencedorId && p.vencedorId === p.equipeBId;
                        return (
                          <div key={`${p.id}:mobile-terceiro`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`truncate text-sm font-semibold ${winnerA ? "text-slate-900" : "text-slate-700"}`}>
                                  {p.equipeANome || p.equipeAId.slice(0, 8)}
                                </div>
                                <div className={`mt-1 truncate text-sm font-semibold ${winnerB ? "text-slate-900" : "text-slate-700"}`}>
                                  {p.equipeBNome || p.equipeBId.slice(0, 8)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold text-slate-900">{p.status === "AGUARDANDO" ? "-" : formatPlacar(p.detalhesPlacar)}</div>
                                <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{p.status}</div>
                              </div>
                            </div>

                            {!p.id.startsWith("placeholder:") ? renderAcoesJogo(p, "mobile") : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[960px] grid grid-cols-4 gap-6">
          {(["OITAVAS", "QUARTAS", "SEMI", "FINAL"] as FaseColuna[]).map((fase) => {
            const jogos = fasesView[fase];
            const visible = fase === "FINAL" ? jogos.length > 0 || jogosTerceiroLugar.length > 0 : jogos.length > 0;
            if (!visible) {
              return (
                <div key={fase} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                  <div className="text-xs text-slate-500 uppercase tracking-wider">{nomeFase(fase)}</div>
                  <div className="mt-4 text-sm text-slate-500">Sem jogos nesta fase.</div>
                </div>
              );
            }
            return (
              <div key={fase} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs text-slate-500 uppercase tracking-wider">{nomeFase(fase)}</div>
                <div className="mt-4 space-y-4">
                  {jogos.map((p) => {
                    const winnerA = p.vencedorId && p.vencedorId === p.equipeAId;
                    const winnerB = p.vencedorId && p.vencedorId === p.equipeBId;
                    return (
                      <div key={p.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`font-semibold truncate ${winnerA ? "text-slate-900" : "text-slate-700"}`}>{p.equipeANome || p.equipeAId.slice(0, 8)}</div>
                            <div className={`font-semibold truncate ${winnerB ? "text-slate-900" : "text-slate-700"}`}>{p.equipeBNome || p.equipeBId.slice(0, 8)}</div>
                            <div className="text-xs text-slate-500 mt-1">{p.status}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900">{p.status === "AGUARDANDO" ? "-" : formatPlacar(p.detalhesPlacar)}</div>
                          </div>
                        </div>
                        {!p.id.startsWith("placeholder:") ? renderAcoesJogo(p, "desktop") : null}
                      </div>
                    );
                  })}
                  {fase === "FINAL" && jogosTerceiroLugar.length > 0 ? (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <div className="text-xs text-slate-500 uppercase tracking-wider">{nomeFase("TERCEIRO_LUGAR")}</div>
                      {jogosTerceiroLugar.map((p) => {
                        const winnerA = p.vencedorId && p.vencedorId === p.equipeAId;
                        const winnerB = p.vencedorId && p.vencedorId === p.equipeBId;
                        return (
                          <div key={`${p.id}:desktop-terceiro`} className="rounded-lg border border-slate-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`font-semibold truncate ${winnerA ? "text-slate-900" : "text-slate-700"}`}>{p.equipeANome || p.equipeAId.slice(0, 8)}</div>
                                <div className={`font-semibold truncate ${winnerB ? "text-slate-900" : "text-slate-700"}`}>{p.equipeBNome || p.equipeBId.slice(0, 8)}</div>
                                <div className="text-xs text-slate-500 mt-1">{p.status}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold text-slate-900">{p.status === "AGUARDANDO" ? "-" : formatPlacar(p.detalhesPlacar)}</div>
                              </div>
                            </div>
                            {!p.id.startsWith("placeholder:") ? renderAcoesJogo(p, "desktop") : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editAgendamentoId &&
        (() => {
          const partida = (Object.values(jogosPorFase) as Partida[][]).flat().find((p) => p.id === editAgendamentoId);
          if (!partida) return null;
          const campo =
            "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50";
          return (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={() => setEditAgendamentoId(null)}>
              <div
                className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-lg sm:rounded-xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wider text-slate-500">Agendamento · {nomeFase(partida.fase)}</div>
                      <div className="text-lg font-bold leading-tight text-slate-900">
                        {partida.equipeANome || "A definir"} <span className="mx-1 text-slate-400">vs</span> {partida.equipeBNome || "A definir"}
                      </div>
                    </div>
                    <button type="button" onClick={() => setEditAgendamentoId(null)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                      <X className="h-4 w-4" />
                      Fechar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Arena</span>
                      <select value={agendaArenaId} onChange={(e) => setAgendaArenaId(e.target.value)} disabled={carregandoArenas} className={campo}>
                        <option value="">{arenas.length === 0 ? "Nenhuma arena disponível" : "Selecione uma arena"}</option>
                        {arenas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome}
                          </option>
                        ))}
                      </select>
                      <span className="block text-xs text-slate-500">
                        Cadastre arenas em <Link href={`/admin/torneios/${slug}/arenas`} className="underline">Arenas</Link>.
                      </span>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Quadra (opcional)</span>
                      <input value={agendaQuadra} onChange={(e) => setAgendaQuadra(e.target.value)} placeholder="Ex: Quadra 1" className={campo} />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Data e horário agendados</span>
                      <input value={agendaDataHorario} onChange={(e) => setAgendaDataHorario(e.target.value)} type="datetime-local" step={60} className={campo} />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Data limite</span>
                      <input value={agendaDataLimite} onChange={(e) => setAgendaDataLimite(e.target.value)} type="date" className={campo} />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditAgendamentoId(null)}
                      className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void salvarAgendamento(partida.id)}
                      disabled={salvandoAgendamento}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {salvandoAgendamento ? "Salvando…" : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {partidaEditando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditConfrontoId(null)}>
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg max-h-[88dvh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-lg font-semibold text-slate-900">Manutenção da chave</div>
              <div className="mt-1 text-sm text-slate-600">
                Ajuste o confronto de {nomeFase(partidaEditando.fase)} antes do início dos jogos.
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Dupla A</label>
                  <select
                    value={confrontoEquipeAId}
                    onChange={(e) => setConfrontoEquipeAId(e.target.value)}
                    disabled={carregandoEquipes}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
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
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                  >
                    {equipes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={modoManutencaoConfronto}
                    onChange={(e) => setModoManutencaoConfronto(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Ativar modo manutenção da fase
                </label>
                <div className="mt-2 text-xs text-slate-600">
                  Use quando a chave já veio pronta e você precisa reorganizar vários confrontos antes de qualquer jogo da fase começar.
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">Substituir dupla na fase</div>
                <div className="mt-1 text-xs text-slate-600">
                  Troca uma dupla em toda a fase atual e remove as fases seguintes para os jogos serem gerados novamente depois.
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Dupla atual na fase</label>
                    <select
                      value={substituicaoEquipeOrigemId}
                      onChange={(e) => setSubstituicaoEquipeOrigemId(e.target.value)}
                      disabled={substituindoEquipe}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                    >
                      {equipesDaFaseEditando.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Nova dupla</label>
                    <select
                      value={substituicaoEquipeDestinoId}
                      onChange={(e) => setSubstituicaoEquipeDestinoId(e.target.value)}
                      disabled={carregandoEquipes || substituindoEquipe}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-50"
                    >
                      <option value="">Selecione...</option>
                      {equipes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setEditConfrontoId(null)}
                className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setSubstituindoEquipe(true);
                    setErro(null);
                    const res = await fetch(
                      `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partidaEditando.id}/substituir-equipe`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          equipeOrigemId: substituicaoEquipeOrigemId,
                          equipeDestinoId: substituicaoEquipeDestinoId,
                        }),
                      }
                    );
                    const payload = (await res.json().catch(() => null)) as any;
                    if (!res.ok) throw new Error(payload?.error || "Falha ao substituir dupla na fase");
                    await carregarChave();
                    setEditConfrontoId(null);
                    setModoManutencaoConfronto(false);
                  } catch (e: any) {
                    setErro(e?.message || "Erro inesperado");
                  } finally {
                    setSubstituindoEquipe(false);
                  }
                }}
                disabled={
                  substituindoEquipe ||
                  carregandoEquipes ||
                  !substituicaoEquipeOrigemId ||
                  !substituicaoEquipeDestinoId ||
                  substituicaoEquipeOrigemId === substituicaoEquipeDestinoId
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 sm:w-auto"
              >
                <Save className="h-4 w-4" />
                {substituindoEquipe ? "Substituindo..." : "Substituir na fase"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setSalvandoConfronto(true);
                    setErro(null);
                    if (partidaIniciada(partidaEditando)) {
                      throw new Error("Não é possível alterar confronto depois que a partida foi iniciada");
                    }
                    const res = await fetch(
                      `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partidaEditando.id}/alterar-confronto`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          equipeAId: confrontoEquipeAId,
                          equipeBId: confrontoEquipeBId,
                          force: modoManutencaoConfronto,
                        }),
                      }
                    );
                    const payload = (await res.json().catch(() => null)) as any;
                    if (!res.ok) throw new Error(payload?.error || "Falha ao alterar confronto");
                    await carregarChave();
                    setEditConfrontoId(null);
                    setModoManutencaoConfronto(false);
                  } catch (e: any) {
                    setErro(e?.message || "Erro inesperado");
                  } finally {
                    setSalvandoConfronto(false);
                  }
                }}
                disabled={salvandoConfronto || carregandoEquipes || !confrontoEquipeAId || !confrontoEquipeBId || confrontoEquipeAId === confrontoEquipeBId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
              >
                <Save className="h-4 w-4" />
                {salvandoConfronto ? "Salvando..." : "Salvar confronto"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {montagemAberta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={fecharMontagemManual}>
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg max-h-[88dvh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-lg font-semibold text-slate-900">Montagem manual do mata-mata</div>
              <div className="mt-1 text-sm text-slate-600">
                Crie os confrontos da fase e, se necessário, limpe as fases seguintes para remontar depois.
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              {erroMontagem ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erroMontagem}</div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <label className="text-sm font-medium text-slate-700">Fase</label>
                  <select
                    value={faseMontagem}
                    onChange={(e) => void abrirMontagemManual((e.target.value as FaseColuna) || "OITAVAS")}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                    disabled={salvandoMontagem}
                  >
                    <option value="OITAVAS">Oitavas</option>
                    <option value="QUARTAS">Quartas</option>
                    <option value="SEMI">Semifinal</option>
                    <option value="FINAL">Final</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <label className="text-sm font-medium text-slate-700">Confrontos</label>
                  <select
                    value={qtdConfrontosMontagem}
                    onChange={(e) => ajustarQtdConfrontos(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                    disabled={salvandoMontagem}
                  >
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end sm:col-span-1">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={limparPosterioresMontagem}
                      onChange={(e) => setLimparPosterioresMontagem(Boolean(e.target.checked))}
                      disabled={salvandoMontagem}
                    />
                    Apagar fase e posteriores
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                {confrontosMontagem.map((c, idx) => (
                  <div key={`montagem:${idx}`} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Dupla A</label>
                      <select
                        value={c.equipeAId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setConfrontosMontagem((prev) => prev.map((p, i) => (i === idx ? { ...p, equipeAId: value } : p)));
                        }}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                        disabled={salvandoMontagem || carregandoEquipes}
                      >
                        <option value="">Selecione</option>
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
                        value={c.equipeBId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setConfrontosMontagem((prev) => prev.map((p, i) => (i === idx ? { ...p, equipeBId: value } : p)));
                        }}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                        disabled={salvandoMontagem || carregandoEquipes}
                      >
                        <option value="">Selecione</option>
                        {equipes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={fecharMontagemManual}
                  disabled={salvandoMontagem}
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarMontagemManual()}
                  disabled={salvandoMontagem}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                >
                  <Save className="h-4 w-4" />
                  {salvandoMontagem ? "Salvando..." : "Salvar fase"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
