"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImageIcon,
  MapPin,
  Pencil,
  Save,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { isRegrasBeachTennisSets, obterRegrasPartidaEfetivas, type RegrasPartidaConfig, type RegrasPartidaPorFase } from "@/lib/regras-partida";
import { gerarCardPartidaAdmin } from "@/lib/match-card-client";

type Categoria = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
  dataHorario?: string | null;
};

type CategoriaConfig = {
  versao: 1;
  formato: "GRUPOS" | "MATA_MATA" | "LIGA";
  tipoParticipacao?: "DUPLAS" | "SIMPLES";
  grupos?: { modo: "AUTO" | "MANUAL"; tamanhoAlvo: number; quantidade?: number };
  classificacao?: { porGrupo: number; melhoresTerceiros?: number };
  fase2?: { habilitada: boolean; temFinal: boolean; disputaTerceiroLugar?: boolean };
  mataMata?: {
    estrutura: "PADRAO" | "SUPER_CAMPEONATO_6" | "GRUPOS_6_MELHORES_PRIMEIROS_BYE" | "GRUPOS_8_CRUZAMENTO_PADRAO";
    quantidadeClassificados?: number;
    habilitarReseed?: boolean;
  };
  regrasPartida?: RegrasPartidaConfig;
  regrasPartidaPorFase?: RegrasPartidaPorFase;
};

type Partida = {
  id: string;
  fase: string;
  status: string;
  rodadaId: string | null;
  rodadaNome: string | null;
  rodadaNumero: number | null;
  grupoId: string | null;
  grupoNome: string | null;
  arenaId?: string | null;
  arenaNome?: string | null;
  quadra?: string | null;
  dataHorario?: string | null;
  dataLimite?: string | null;
  fotoUrl?: string | null;
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

type Arena = { id: string; nome: string; logoUrl?: string | null };

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDateInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatarDataHoraCurta(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const statusStyle: Record<string, string> = {
  AGENDADA: "bg-blue-50 text-blue-700 border-blue-100",
  FINALIZADA: "bg-green-50 text-green-700 border-green-100",
  WO: "bg-red-50 text-red-700 border-red-100",
  CANCELADA: "bg-slate-100 text-slate-500 border-slate-200",
};

function StatusBadge({ status, dataHorario }: { status: string; dataHorario?: string | null }) {
  if (status === "AGENDADA" && !dataHorario) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-amber-50 text-amber-700 border-amber-100">
        A definir
      </span>
    );
  }
  const cls = statusStyle[status] || "bg-slate-50 text-slate-600 border-slate-100";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${cls}`}>
      {status === "AGENDADA" ? "Agendada" : status === "FINALIZADA" ? "Finalizada" : status}
    </span>
  );
}

function inicializarFormPlacarFromDetalhes(detalhes: Partida["detalhesPlacar"]) {
  const f = { s1a: "", s1b: "", tb1a: "", tb1b: "", s2a: "", s2b: "", tb2a: "", tb2b: "", s3a: "", s3b: "" };
  if (!detalhes || detalhes.length === 0) return f;
  for (const set of detalhes) {
    if (set.set === 1) {
      f.s1a = String(set.a ?? "");
      f.s1b = String(set.b ?? "");
      if (set.tiebreak && typeof set.tbA === "number" && typeof set.tbB === "number") {
        f.tb1a = String(set.tbA);
        f.tb1b = String(set.tbB);
      }
    } else if (set.set === 2) {
      f.s2a = String(set.a ?? "");
      f.s2b = String(set.b ?? "");
      if (set.tiebreak && typeof set.tbA === "number" && typeof set.tbB === "number") {
        f.tb2a = String(set.tbA);
        f.tb2b = String(set.tbB);
      }
    } else if (set.set === 3) {
      f.s3a = String(set.a ?? "");
      f.s3b = String(set.b ?? "");
    }
  }
  return f;
}

export default function AdminLancarPlacarMobilePage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;
  const router = useRouter();

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [config, setConfig] = useState<CategoriaConfig | null>(null);
  const [torneioSuperCampeonatoFormato, setTorneioSuperCampeonatoFormato] = useState<"2_SET_SUPER_TIE" | "1_SET">("2_SET_SUPER_TIE");
  const [torneioNome, setTorneioNome] = useState("");
  const [torneioCardApenasComFotos, setTorneioCardApenasComFotos] = useState(false);
  const [torneioTemplateUrl, setTorneioTemplateUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [carregandoPartidas, setCarregandoPartidas] = useState(false);

  const [buscaAtleta, setBuscaAtleta] = useState("");
  const [indiceRodadaAtiva, setIndiceRodadaAtiva] = useState(0);

  const [editPartidaId, setEditPartidaId] = useState<string | null>(null);
  const [salvandoPartida, setSalvandoPartida] = useState(false);
  const [formPlacar, setFormPlacar] = useState({ s1a: "", s1b: "", tb1a: "", tb1b: "", s2a: "", s2b: "", tb2a: "", tb2b: "", s3a: "", s3b: "" });

  const [editAgendamentoId, setEditAgendamentoId] = useState<string | null>(null);
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [agendaArenaId, setAgendaArenaId] = useState("");
  const [agendaQuadra, setAgendaQuadra] = useState("");
  const [agendaDataHorario, setAgendaDataHorario] = useState("");
  const [agendaDataLimite, setAgendaDataLimite] = useState("");
  const [carregandoArenas, setCarregandoArenas] = useState(false);

  async function carregarTudo() {
    try {
      setCarregando(true);
      setErro(null);
      const [resCat, resTorneio, resConfig] = await Promise.all([
        fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/config`, { cache: "no-store" }).catch(() => ({ ok: false })),
      ]);

      if (resCat.ok) {
        const cats = (await resCat.json()) as Categoria[];
        setCategoria(cats.find((c) => c.id === categoriaId) ?? null);
      }

      if (resTorneio.ok) {
        const t = (await resTorneio.json()) as any;
        setTorneioSuperCampeonatoFormato(t?.superCampeonatoFormato === "1_SET" ? "1_SET" : "2_SET_SUPER_TIE");
        setTorneioNome(t?.nome || "");
        setTorneioCardApenasComFotos(Boolean(t?.cardApenasComFotos));
        setTorneioTemplateUrl(t?.templateUrl || null);
      }

      if (resConfig.ok) {
        const cfg = (await (resConfig as any).json().catch(() => null)) as CategoriaConfig | null;
        if (cfg) setConfig(cfg);
      }
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setCarregando(false);
      await carregarPartidas();
    }
  }

  async function carregarPartidas() {
    try {
      setCarregandoPartidas(true);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=GRUPOS`, { cache: "no-store" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao carregar jogos");
      }
      const rows = ((await res.json()) as Partida[]) ?? [];
      setPartidas(rows);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar jogos");
    } finally {
      setCarregandoPartidas(false);
    }
  }

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, categoriaId]);

  const atletasFiltroOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partidas) {
      for (const a of p.equipeAAtletas ?? []) if (a?.id && a?.nome) map.set(a.id, a.nome);
      for (const a of p.equipeBAtletas ?? []) if (a?.id && a?.nome) map.set(a.id, a.nome);
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [partidas]);

  const partidasFiltradasPorAtleta = useMemo(() => {
    if (!buscaAtleta.trim()) return partidas;
    const termo = buscaAtleta.trim().toLowerCase();
    const ids = atletasFiltroOptions
      .filter((a) => a.nome.toLowerCase().includes(termo))
      .map((a) => a.id);
    return partidas.filter((p) => {
      if (ids.length > 0) {
        const a = (p.equipeAAtletas ?? []).some((x) => ids.includes(x.id));
        const b = (p.equipeBAtletas ?? []).some((x) => ids.includes(x.id));
        if (a || b) return true;
      }
      const eqA = (p.equipeANome || "").toLowerCase();
      const eqB = (p.equipeBNome || "").toLowerCase();
      return eqA.includes(termo) || eqB.includes(termo);
    });
  }, [partidas, buscaAtleta, atletasFiltroOptions]);

  const rodadasView = useMemo(() => {
    const map = new Map<number, Partida[]>();
    for (const p of partidasFiltradasPorAtleta) {
      const n = p.rodadaNumero ?? 0;
      const list = map.get(n) ?? [];
      list.push(p);
      map.set(n, list);
    }
    return Array.from(map.entries())
      .filter(([n, jogos]) => n > 0 && jogos.length > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([numero, jogos]) => ({
        numero,
        jogos: jogos.slice().sort((a, b) => {
          const dha = a.dataHorario ? new Date(a.dataHorario).getTime() : Number.MAX_SAFE_INTEGER;
          const dhb = b.dataHorario ? new Date(b.dataHorario).getTime() : Number.MAX_SAFE_INTEGER;
          if (dha !== dhb) return dha - dhb;
          const ga = a.grupoNome || "";
          const gb = b.grupoNome || "";
          if (ga !== gb) return ga.localeCompare(gb, "pt-BR");
          return (a.equipeANome || "").localeCompare(b.equipeANome || "", "pt-BR");
        }),
      }));
  }, [partidasFiltradasPorAtleta]);

  useEffect(() => {
    if (rodadasView.length === 0) {
      setIndiceRodadaAtiva(0);
      return;
    }
    if (indiceRodadaAtiva >= rodadasView.length) {
      setIndiceRodadaAtiva(Math.max(0, rodadasView.length - 1));
    }
  }, [rodadasView.length, indiceRodadaAtiva]);

  const rodadaAtual = rodadasView[indiceRodadaAtiva];

  async function abrirEditarPlacar(p: Partida) {
    setEditPartidaId(p.id);
    setFormPlacar(inicializarFormPlacarFromDetalhes(p.detalhesPlacar));
  }

  async function salvarPlacar(p: Partida) {
    try {
      setSalvandoPartida(true);
      setErro(null);

      const partidaTemPlacarInformado =
        p.status === "FINALIZADA" ||
        p.status === "WO" ||
        Boolean(p.vencedorId) ||
        (p.placarA ?? 0) !== 0 ||
        (p.placarB ?? 0) !== 0 ||
        (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0);

      const temAlgumPlacar = Object.values(formPlacar).some((v) => v.trim() !== "");
      if (!temAlgumPlacar) {
        if (partidaTemPlacarInformado) {
          const resCancelar = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}/cancelar-placar`, { method: "POST" });
          const payloadCancelar = (await resCancelar.json().catch(() => null)) as any;
          if (!resCancelar.ok) throw new Error(payloadCancelar?.error || "Falha ao limpar placar");
          await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
          await carregarPartidas();
          setEditPartidaId(null);
          return;
        }
        setEditPartidaId(null);
        return;
      }

      const regras = obterRegrasPartidaEfetivas({
        regrasBase: config?.regrasPartida ?? null,
        regrasPorFase: config?.regrasPartidaPorFase ?? null,
        fase: p.fase ?? null,
        superCampeonato: true,
        superCampeonatoFormato: torneioSuperCampeonatoFormato ?? null,
      });
      const regrasBT = isRegrasBeachTennisSets(regras) ? regras : null;
      const melhorDe = torneioSuperCampeonatoFormato === "1_SET" ? 1 : 3;
      const superTie = true;
      const tbHabilitado = regrasBT?.tiebreak?.habilitado ?? true;
      const tbEm = regrasBT?.tiebreak?.em ?? (regrasBT?.gamesPorSet ?? 6);

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
          const isTb =
            Boolean(set.tiebreak) &&
            ((Number(set.a) === tbEm && Number(set.b) === tbEm) || (Math.max(Number(set.a), Number(set.b)) === tbEm + 1 && Math.min(Number(set.a), Number(set.b)) === tbEm));
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

      await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
      await carregarPartidas();
      setEditPartidaId(null);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoPartida(false);
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
      const lista = rows
        .map((a) => ({ id: a.id as string, nome: (a.nome as string) ?? "", logoUrl: (a.logoUrl as string | null | undefined) ?? null }))
        .filter((a) => a.id && a.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setArenas(lista);
    } finally {
      setCarregandoArenas(false);
    }
  }

  async function salvarAgendamento(partida: Partida) {
    try {
      setSalvandoAgendamento(true);
      setErro(null);
      if (agendaDataHorario.trim() && !agendaArenaId) throw new Error("Selecione uma arena para agendar a partida");
      const toIsoDateTime = (v: string) => (v.trim() ? new Date(v).toISOString() : null);
      const toIsoDate = (v: string) => (v.trim() ? new Date(`${v}T00:00:00`).toISOString() : null);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partida.id}/agendamento`, {
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
      await carregarPartidas();
      setEditAgendamentoId(null);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoAgendamento(false);
    }
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

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Carregando jogos…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-xl mx-auto px-3 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white h-10 w-10 text-slate-700 hover:bg-slate-50"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                <Smartphone className="h-3.5 w-3.5" />
                <span className="truncate">Tela rápida</span>
              </div>
              <h1 className="text-base font-bold truncate leading-tight">
                {categoria?.nome || "Lançar placar"}
              </h1>
            </div>
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/jogos/super`}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white h-10 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Completa
            </Link>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={buscaAtleta}
              onChange={(e) => setBuscaAtleta(e.target.value)}
              placeholder="Buscar atleta ou dupla…"
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 placeholder:text-slate-400"
            />
            {buscaAtleta && (
              <button
                type="button"
                onClick={() => setBuscaAtleta("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIndiceRodadaAtiva((i) => Math.max(0, i - 1))}
              disabled={indiceRodadaAtiva === 0}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white h-10 w-10 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Rodada anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 rounded-xl border border-slate-200 bg-slate-900 text-white px-3 py-2 text-center">
              {rodadasView.length === 0 ? (
                <span className="text-sm font-semibold">Sem rodadas</span>
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Rodada</div>
                  <div className="text-base font-extrabold leading-tight">
                    {rodadaAtual?.numero ?? 0}{" "}
                    <span className="font-normal text-slate-300 text-sm">/ {rodadasView.length}</span>
                  </div>
                  {rodadaAtual?.jogos?.length && (
                    <div className="text-[10px] text-slate-300 mt-0.5">{rodadaAtual.jogos.length} jogos</div>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIndiceRodadaAtiva((i) => Math.min(rodadasView.length - 1, i + 1))}
              disabled={rodadasView.length === 0 || indiceRodadaAtiva >= rodadasView.length - 1}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white h-10 w-10 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Próxima rodada"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {erro && (
        <div className="max-w-xl mx-auto px-3 pt-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm px-3 py-2">{erro}</div>
        </div>
      )}

      <main className="max-w-xl mx-auto px-3 py-4 space-y-3 pb-10">
        {carregandoPartidas && (
          <div className="text-center text-sm text-slate-500 py-6">Atualizando jogos…</div>
        )}

        {!carregandoPartidas && rodadasView.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-800">Nenhum jogo encontrado</div>
            <div className="text-xs text-slate-500">
              {buscaAtleta ? "Tente outra busca ou limpe o filtro." : "Os jogos desta categoria ainda não foram gerados."}
            </div>
            {buscaAtleta && (
              <button
                type="button"
                onClick={() => setBuscaAtleta("")}
                className="mt-2 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}

        {rodadaAtual?.jogos?.length &&
          rodadaAtual.jogos.map((p) => {
            const nomeA = p.equipeANome || p.equipeAId.slice(0, 8);
            const nomeB = p.equipeBNome || p.equipeBId.slice(0, 8);
            const atletaNomesA = (p.equipeAAtletas ?? []).map((a) => a.nome).filter(Boolean).join(" / ");
            const atletaNomesB = (p.equipeBAtletas ?? []).map((a) => a.nome).filter(Boolean).join(" / ");
            const temPlacar =
              p.status === "FINALIZADA" ||
              p.status === "WO" ||
              (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0);
            return (
              <article key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-3 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 min-w-0 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="tabular-nums">{formatarDataHoraCurta(p.dataHorario)}</span>
                    </span>
                    {p.arenaNome && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[140px]">
                          {p.arenaNome}
                          {p.quadra ? ` · Q${p.quadra}` : ""}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => gerarCardPartida(p)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white h-8 w-8 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                      title="Gerar card do jogo"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <StatusBadge status={p.status} dataHorario={p.dataHorario} />
                  </div>
                </div>

                <div className="px-3 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-sm font-bold text-slate-900 leading-tight truncate">{nomeA}</div>
                      {atletaNomesA && atletaNomesA !== nomeA && (
                        <div className="text-[11px] text-slate-500 leading-tight truncate">{atletaNomesA}</div>
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-400 px-2 flex-shrink-0">x</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-900 leading-tight truncate">{nomeB}</div>
                      {atletaNomesB && atletaNomesB !== nomeB && (
                        <div className="text-[11px] text-slate-500 leading-tight truncate">{atletaNomesB}</div>
                      )}
                    </div>
                  </div>

                  {temPlacar && (
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Placar</div>
                      <div className="text-base font-extrabold text-slate-900 tabular-nums leading-tight">
                        {p.placarA} <span className="text-slate-400 font-bold">x</span> {p.placarB}
                      </div>
                      {Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0 && (
                        <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                          {p.detalhesPlacar
                            .slice()
                            .sort((a, b) => a.set - b.set)
                            .map((set) => {
                              if (set.tiebreak && typeof set.tbA === "number" && typeof set.tbB === "number")
                                return `${set.a}-${set.b} (${set.tbA}-${set.tbB})`;
                              return `${set.a}-${set.b}`;
                            })
                            .join("   ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => abrirEditarPlacar(p)}
                    className={`inline-flex items-center justify-center gap-1 rounded-xl px-2 py-3 text-[13px] font-bold shadow-sm disabled:opacity-50 ${
                      temPlacar
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="truncate">{temPlacar ? "Editar" : "Placar"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirAgendamento(p)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-[13px] font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <Clock className="h-4 w-4" />
                    <span className="truncate">Agendar</span>
                  </button>
                  <Link
                    href={`/admin/torneios/${slug}/categorias/${categoriaId}/jogos/arbitro`}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-3 text-[13px] font-bold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Smartphone className="h-4 w-4" />
                    <span className="truncate">Árbitro</span>
                  </Link>
                </div>
              </article>
            );
          })}
      </main>

      {editPartidaId &&
        (() => {
          const partida = partidas.find((p) => p.id === editPartidaId);
          if (!partida) return null;
          const nomeA = partida.equipeANome || partida.equipeAId.slice(0, 8);
          const nomeB = partida.equipeBNome || partida.equipeBId.slice(0, 8);
          const superTie = true;
          const melhorDe = torneioSuperCampeonatoFormato === "1_SET" ? 1 : 3;
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
              <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 bg-white shadow-xl max-h-[88vh] overflow-y-auto">
                <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center justify-between gap-2 z-10">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Placar</div>
                    <div className="text-sm font-extrabold text-slate-900 truncate">{nomeA} x {nomeB}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditPartidaId(null)}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white h-9 w-9 text-slate-600 hover:bg-slate-50"
                    aria-label="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-4 py-4 space-y-4">
                  <div className="space-y-3">
                    {[1, 2, 3].filter((s) => s <= melhorDe).map((setNum) => {
                      const isSet3 = setNum === 3;
                      const precisaSet3ComOpcional = melhorDe === 3 && setNum === 3;
                      return (
                        <div key={setNum} className="rounded-2xl border border-slate-200 p-3 space-y-2">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            Set {setNum}
                            {isSet3 && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
                                {superTie ? "Super tie-break (se precisar)" : "Set 3 (se precisar)"}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 items-center">
                            <input
                              type="number"
                              inputMode="numeric"
                              placeholder="A"
                              value={(formPlacar as any)[`s${setNum}a`]}
                              onChange={(e) => setFormPlacar((f) => ({ ...f, [`s${setNum}a`]: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-xl font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                            />
                            <div className="text-center text-slate-400 font-bold text-lg">x</div>
                            <input
                              type="number"
                              inputMode="numeric"
                              placeholder="B"
                              value={(formPlacar as any)[`s${setNum}b`]}
                              onChange={(e) => setFormPlacar((f) => ({ ...f, [`s${setNum}b`]: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-xl font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                            />
                          </div>
                          {!isSet3 && (
                            <>
                              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider pt-1">
                                Tie-break (se 6-6 ou {torneioSuperCampeonatoFormato === "1_SET" ? "TB" : "6-6"})
                              </div>
                              <div className="grid grid-cols-3 gap-2 items-center">
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="TB A"
                                  value={(formPlacar as any)[`tb${setNum}a`]}
                                  onChange={(e) => setFormPlacar((f) => ({ ...f, [`tb${setNum}a`]: e.target.value }))}
                                  className="w-full rounded-xl border border-slate-200 px-2 py-2 text-center text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                />
                                <div className="text-center text-slate-400 font-bold text-sm">x</div>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="TB B"
                                  value={(formPlacar as any)[`tb${setNum}b`]}
                                  onChange={(e) => setFormPlacar((f) => ({ ...f, [`tb${setNum}b`]: e.target.value }))}
                                  className="w-full rounded-xl border border-slate-200 px-2 py-2 text-center text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditPartidaId(null)}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => salvarPlacar(partida)}
                      disabled={salvandoPartida}
                      className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {salvandoPartida ? "Salvando…" : "Salvar placar"}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    Deixar tudo em branco e clicar em Salvar irá limpar o placar deste jogo.
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {editAgendamentoId &&
        (() => {
          const partida = partidas.find((p) => p.id === editAgendamentoId);
          if (!partida) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
              <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 bg-white shadow-xl max-h-[88vh] overflow-y-auto">
                <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center justify-between gap-2 z-10">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Agendar</div>
                    <div className="text-sm font-extrabold text-slate-900 truncate">
                      {partida.equipeANome || partida.equipeAId.slice(0, 8)} x {partida.equipeBNome || partida.equipeBId.slice(0, 8)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditAgendamentoId(null)}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white h-9 w-9 text-slate-600 hover:bg-slate-50"
                    aria-label="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-4 py-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Arena</label>
                    <select
                      value={agendaArenaId}
                      onChange={(e) => setAgendaArenaId(e.target.value)}
                      disabled={carregandoArenas}
                      className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white disabled:opacity-50"
                    >
                      <option value="">{arenas.length === 0 ? "Nenhuma arena cadastrada" : "Selecione uma arena"}</option>
                      {arenas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Quadra (opcional)</label>
                    <input
                      value={agendaQuadra}
                      onChange={(e) => setAgendaQuadra(e.target.value)}
                      placeholder="Ex: 1"
                      className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Data e horário</label>
                    <input
                      type="datetime-local"
                      step={60}
                      value={agendaDataHorario}
                      onChange={(e) => setAgendaDataHorario(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Data limite (opcional)</label>
                    <input
                      type="date"
                      value={agendaDataLimite}
                      onChange={(e) => setAgendaDataLimite(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditAgendamentoId(null)}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => salvarAgendamento(partida)}
                      disabled={salvandoAgendamento}
                      className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {salvandoAgendamento ? "Salvando…" : "Salvar agendamento"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
