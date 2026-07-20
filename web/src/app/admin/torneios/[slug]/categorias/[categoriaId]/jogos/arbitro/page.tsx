"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, RefreshCw, Save, Trophy, X } from "lucide-react";
import {
  isRegrasBeachTennisSets,
  isRegrasVoleiSets,
  obterRegrasPartidaEfetivas,
  type RegrasPartidaConfig,
  type SuperCampeonatoFormato,
} from "@/lib/regras-partida";

type Categoria = {
  id: string;
  nome: string;
  torneioId: string;
};

type TorneioResumo = {
  nome: string;
  superCampeonato?: boolean | null;
  superCampeonatoFormato?: SuperCampeonatoFormato | null;
};

type CategoriaConfig = {
  versao: 1;
  formato: "GRUPOS" | "MATA_MATA" | "LIGA";
  regrasPartida?: RegrasPartidaConfig;
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
    setsPro?: number;
  }[];
};

type Partida = {
  id: string;
  fase: "GRUPOS" | "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL" | "TERCEIRO_LUGAR";
  status: string;
  grupoId: string | null;
  grupoNome: string | null;
  rodadaNome?: string | null;
  rodadaNumero?: number | null;
  dataHorario?: string | null;
  dataLimite?: string | null;
  arenaNome?: string | null;
  quadra?: string | null;
  equipeAId: string;
  equipeANome: string | null;
  equipeBId: string;
  equipeBNome: string | null;
  vencedorId: string | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

type FormPlacar = {
  s1a: string;
  s1b: string;
  tb1a: string;
  tb1b: string;
  s2a: string;
  s2b: string;
  tb2a: string;
  tb2b: string;
  s3a: string;
  s3b: string;
  s4a: string;
  s4b: string;
  s5a: string;
  s5b: string;
};

const FASES: Array<Partida["fase"]> = ["GRUPOS", "OITAVAS", "QUARTAS", "SEMI", "FINAL"];

const LABEL_FASE: Record<Partida["fase"], string> = {
  GRUPOS: "Grupos",
  OITAVAS: "Oitavas",
  QUARTAS: "Quartas",
  SEMI: "Semi",
  FINAL: "Final",
  TERCEIRO_LUGAR: "3º lugar",
};

const FORM_PLACAR_VAZIO: FormPlacar = {
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
  s4a: "",
  s4b: "",
  s5a: "",
  s5b: "",
};

function getStatusBadge(status: string, dataHorario?: string | null) {
  if (status === "AGENDADA" && !dataHorario) {
    return (
      <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
        A definir
      </span>
    );
  }
  const styles: Record<string, string> = {
    AGENDADA: "border-blue-100 bg-blue-50 text-blue-700",
    FINALIZADA: "border-green-100 bg-green-50 text-green-700",
    WO: "border-red-100 bg-red-50 text-red-700",
    CANCELADA: "border-slate-200 bg-slate-100 text-slate-500",
  };
  const className = styles[status] || "border-slate-100 bg-slate-50 text-slate-600";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}>{status}</span>;
}

function formatDataHora(value?: string | null) {
  if (!value) return null;
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPlacar(detalhes: Partida["detalhesPlacar"]) {
  if (!detalhes || detalhes.length === 0) return "X";
  return detalhes
    .slice()
    .sort((a, b) => a.set - b.set)
    .map((set) => {
      if (set.tiebreak && set.tbA !== undefined && set.tbB !== undefined) {
        return `${set.a}-${set.b} (${set.tbA}-${set.tbB})`;
      }
      return `${set.a}-${set.b}`;
    })
    .join(" ");
}

function nomeEquipe(partida: Pick<Partida, "equipeAId" | "equipeANome" | "equipeBId" | "equipeBNome">, lado: "A" | "B") {
  const nome = lado === "A" ? partida.equipeANome : partida.equipeBNome;
  const id = lado === "A" ? partida.equipeAId : partida.equipeBId;
  return nome || id.slice(0, 8);
}

export default function AdminCategoriaJogosArbitroPage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [torneio, setTorneio] = useState<TorneioResumo | null>(null);
  const [config, setConfig] = useState<CategoriaConfig | null>(null);
  const [classificacao, setClassificacao] = useState<GrupoClassificacao[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [fase, setFase] = useState<Partida["fase"]>("GRUPOS");
  const [filtroGrupoId, setFiltroGrupoId] = useState("");
  const [filtroEquipeId, setFiltroEquipeId] = useState("");
  const [mostrarClassificacao, setMostrarClassificacao] = useState(false);
  const [carregandoBase, setCarregandoBase] = useState(true);
  const [carregandoPartidas, setCarregandoPartidas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editPartidaId, setEditPartidaId] = useState<string | null>(null);
  const [salvandoPartida, setSalvandoPartida] = useState(false);
  const [formPlacar, setFormPlacar] = useState<FormPlacar>(FORM_PLACAR_VAZIO);

  const regrasEfetivas = useMemo(
    () =>
      obterRegrasPartidaEfetivas({
        regrasBase: config?.regrasPartida,
        superCampeonato: torneio?.superCampeonato,
        superCampeonatoFormato: torneio?.superCampeonatoFormato,
      }),
    [config?.regrasPartida, torneio?.superCampeonato, torneio?.superCampeonatoFormato]
  );

  async function carregarBase() {
    try {
      setCarregandoBase(true);
      setErro(null);

      const [resTorneio, resCategorias, resConfig, resClass] = await Promise.all([
        fetch(`/api/v1/torneios/${slug}`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/config`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" }),
      ]);

      if (!resCategorias.ok) {
        const payload = (await resCategorias.json().catch(() => null)) as any;
        throw new Error(payload?.error || "Não foi possível carregar a categoria");
      }

      const categorias = (await resCategorias.json()) as Categoria[];
      const atual = categorias.find((item) => item.id === categoriaId) ?? null;
      if (!atual) throw new Error("Categoria não encontrada");
      setCategoria(atual);

      if (resTorneio.ok) {
        const data = (await resTorneio.json()) as any;
        setTorneio({
          nome: String(data?.nome || "Torneio"),
          superCampeonato: Boolean(data?.superCampeonato),
          superCampeonatoFormato: data?.superCampeonatoFormato === "1_SET" ? "1_SET" : "2_SET_SUPER_TIE",
        });
      }

      if (resConfig.ok) setConfig((await resConfig.json()) as CategoriaConfig);
      if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setCarregandoBase(false);
    }
  }

  async function carregarPartidas(faseAtual = fase) {
    try {
      setCarregandoPartidas(true);
      setErro(null);
      const fasesConsulta = faseAtual === "FINAL" ? ["FINAL", "TERCEIRO_LUGAR"] : [faseAtual];
      const respostas = await Promise.all(
        fasesConsulta.map(async (faseConsulta) => {
          const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=${faseConsulta}`, { cache: "no-store" });
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as any;
            throw new Error(payload?.error || "Não foi possível carregar os jogos");
          }
          return (await res.json()) as Partida[];
        })
      );
      setPartidas(
        respostas
          .flat()
          .sort((a, b) => {
            const ordemA = a.fase === "FINAL" ? 0 : a.fase === "TERCEIRO_LUGAR" ? 1 : 99;
            const ordemB = b.fase === "FINAL" ? 0 : b.fase === "TERCEIRO_LUGAR" ? 1 : 99;
            return ordemA - ordemB || a.id.localeCompare(b.id);
          })
      );
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
      setPartidas([]);
    } finally {
      setCarregandoPartidas(false);
    }
  }

  useEffect(() => {
    void carregarBase();
  }, [slug, categoriaId]);

  useEffect(() => {
    void carregarPartidas(fase);
  }, [slug, categoriaId, fase]);

  useEffect(() => {
    if (fase !== "GRUPOS") {
      setFiltroGrupoId("");
      setMostrarClassificacao(false);
    }
  }, [fase]);

  const gruposOptions = useMemo(() => {
    return Array.from(
      new Map(
        partidas
          .filter((partida) => Boolean(partida.grupoId))
          .map((partida) => [partida.grupoId as string, partida.grupoNome || "Sem chave"])
      ).entries()
    )
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" }));
  }, [partidas]);

  const equipesOptions = useMemo(() => {
    return Array.from(
      new Map(
        partidas.flatMap((partida) => [
          [partida.equipeAId, nomeEquipe(partida, "A")],
          [partida.equipeBId, nomeEquipe(partida, "B")],
        ])
      ).entries()
    )
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  }, [partidas]);

  useEffect(() => {
    if (!filtroGrupoId) return;
    if (gruposOptions.some((grupo) => grupo.id === filtroGrupoId)) return;
    setFiltroGrupoId("");
  }, [filtroGrupoId, gruposOptions]);

  useEffect(() => {
    if (!filtroEquipeId) return;
    if (equipesOptions.some((equipe) => equipe.id === filtroEquipeId)) return;
    setFiltroEquipeId("");
  }, [filtroEquipeId, equipesOptions]);

  const partidasFiltradas = useMemo(() => {
    return partidas.filter((partida) => {
      if (fase === "GRUPOS" && filtroGrupoId && partida.grupoId !== filtroGrupoId) return false;
      if (filtroEquipeId && partida.equipeAId !== filtroEquipeId && partida.equipeBId !== filtroEquipeId) return false;
      return true;
    });
  }, [partidas, fase, filtroGrupoId, filtroEquipeId]);

  const partidasAgrupadas = useMemo(() => {
    if (fase === "FINAL") {
      return (["FINAL", "TERCEIRO_LUGAR"] as const)
        .map((faseAtual) => ({
          titulo: LABEL_FASE[faseAtual],
          partidas: partidasFiltradas.filter((partida) => partida.fase === faseAtual),
        }))
        .filter((grupo) => grupo.partidas.length > 0);
    }

    if (fase !== "GRUPOS") {
      return [{ titulo: LABEL_FASE[fase], partidas: partidasFiltradas }];
    }

    const mapa = new Map<string, Partida[]>();
    for (const partida of partidasFiltradas) {
      const chave = partida.grupoNome || "Sem chave";
      const lista = mapa.get(chave) ?? [];
      lista.push(partida);
      mapa.set(chave, lista);
    }

    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true, sensitivity: "base" }))
      .map(([titulo, jogos]) => ({ titulo, partidas: jogos }));
  }, [fase, partidasFiltradas]);

  const classificacaoFiltrada = useMemo(() => {
    if (!filtroGrupoId) return classificacao;
    return classificacao.filter((grupo) => grupo.grupoId === filtroGrupoId);
  }, [classificacao, filtroGrupoId]);

  function startEditPartida(partida: Partida) {
    const detalhes = (partida.detalhesPlacar ?? []).slice().sort((a, b) => a.set - b.set);
    setEditPartidaId(partida.id);
    setFormPlacar({
      s1a: detalhes[0]?.a?.toString?.() ?? "",
      s1b: detalhes[0]?.b?.toString?.() ?? "",
      tb1a: detalhes[0]?.tbA?.toString?.() ?? "",
      tb1b: detalhes[0]?.tbB?.toString?.() ?? "",
      s2a: detalhes[1]?.a?.toString?.() ?? "",
      s2b: detalhes[1]?.b?.toString?.() ?? "",
      tb2a: detalhes[1]?.tbA?.toString?.() ?? "",
      tb2b: detalhes[1]?.tbB?.toString?.() ?? "",
      s3a: detalhes[2]?.a?.toString?.() ?? "",
      s3b: detalhes[2]?.b?.toString?.() ?? "",
      s4a: detalhes[3]?.a?.toString?.() ?? "",
      s4b: detalhes[3]?.b?.toString?.() ?? "",
      s5a: detalhes[4]?.a?.toString?.() ?? "",
      s5b: detalhes[4]?.b?.toString?.() ?? "",
    });
    setErro(null);
  }

  function fecharModal() {
    setEditPartidaId(null);
    setFormPlacar(FORM_PLACAR_VAZIO);
  }

  async function recarregarClassificacaoSeNecessario() {
    if (fase !== "GRUPOS") return;
    await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
    const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
    if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
  }

  async function cancelarPlacar(partida: Partida) {
    try {
      setSalvandoPartida(true);
      setErro(null);
      setFlash(null);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partida.id}/cancelar-placar`, {
        method: "POST",
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao cancelar placar");
      await recarregarClassificacaoSeNecessario();
      await carregarPartidas();
      setFlash("Placar removido com sucesso.");
      fecharModal();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoPartida(false);
    }
  }

  async function salvarPlacar(partida: Partida) {
    try {
      setSalvandoPartida(true);
      setErro(null);
      setFlash(null);

      const partidaTemPlacarInformado =
        partida.status === "FINALIZADA" ||
        partida.status === "WO" ||
        Boolean(partida.vencedorId) ||
        (Array.isArray(partida.detalhesPlacar) && partida.detalhesPlacar.length > 0);

      const temAlgumPlacar = Object.values(formPlacar).some((valor) => valor.trim() !== "");
      if (!temAlgumPlacar) {
        if (partidaTemPlacarInformado) {
          await cancelarPlacar(partida);
          return;
        }
        fecharModal();
        return;
      }

      const detalhes: any[] = [];

      if (isRegrasVoleiSets(regrasEfetivas)) {
        const totalSets = regrasEfetivas.melhorDe;
        const sets = [
          { a: formPlacar.s1a.trim(), b: formPlacar.s1b.trim() },
          { a: formPlacar.s2a.trim(), b: formPlacar.s2b.trim() },
          { a: formPlacar.s3a.trim(), b: formPlacar.s3b.trim() },
          { a: formPlacar.s4a.trim(), b: formPlacar.s4b.trim() },
          { a: formPlacar.s5a.trim(), b: formPlacar.s5b.trim() },
        ];
        let encontrouSetVazio = false;

        for (let index = 0; index < totalSets; index += 1) {
          const atual = sets[index];
          const ambosVazios = !atual.a && !atual.b;
          if (ambosVazios) {
            encontrouSetVazio = true;
            continue;
          }
          if (!atual.a || !atual.b) throw new Error(`Informe o placar completo do set ${index + 1}`);
          if (encontrouSetVazio) throw new Error("Preencha os sets em ordem, sem pular placares intermediários");
          detalhes.push({ set: index + 1, a: Number(atual.a), b: Number(atual.b) });
        }

        if (detalhes.length === 0) throw new Error("Informe o placar do set 1");
      } else if (isRegrasBeachTennisSets(regrasEfetivas)) {
        const melhorDe = regrasEfetivas.melhorDe ?? 1;
        const superTie = regrasEfetivas.superTiebreakDecisivo?.habilitado ?? false;
        const tbHabilitado = regrasEfetivas.tiebreak?.habilitado ?? true;
        const tbEm = regrasEfetivas.tiebreak?.em ?? (regrasEfetivas.gamesPorSet ?? 6);

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
              ((Number(set.a) === tbEm && Number(set.b) === tbEm) ||
                (Math.max(Number(set.a), Number(set.b)) === tbEm + 1 && Math.min(Number(set.a), Number(set.b)) === tbEm));
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
      } else {
        throw new Error("Regras de partida não suportadas nesta tela");
      }

      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partida.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalhesPlacar: detalhes }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar placar");

      await recarregarClassificacaoSeNecessario();
      await carregarPartidas(payload?.proximaFaseCriada || payload?.proximaFaseAtualizada || fase);
      if (payload?.proximaFaseCriada || payload?.proximaFaseAtualizada) {
        setFase((payload?.proximaFaseCriada || payload?.proximaFaseAtualizada) as Partida["fase"]);
      }
      setFlash("Placar salvo com sucesso.");
      fecharModal();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvandoPartida(false);
    }
  }

  const partidaEditando = partidas.find((partida) => partida.id === editPartidaId) ?? null;
  const regrasBT = isRegrasBeachTennisSets(regrasEfetivas) ? regrasEfetivas : null;
  const regrasVolei = isRegrasVoleiSets(regrasEfetivas) ? regrasEfetivas : null;
  const melhorDe = regrasVolei?.melhorDe ?? regrasBT?.melhorDe ?? 1;
  const superTie = regrasBT?.superTiebreakDecisivo?.habilitado ?? false;
  const tbHabilitado = regrasBT?.tiebreak?.habilitado ?? true;
  const tbEm = regrasBT?.tiebreak?.em ?? (regrasBT?.gamesPorSet ?? 6);
  const s1aN = Number(formPlacar.s1a);
  const s1bN = Number(formPlacar.s1b);
  const s2aN = Number(formPlacar.s2a);
  const s2bN = Number(formPlacar.s2b);
  const isTbScore = (a: number, b: number) =>
    Number.isFinite(a) && Number.isFinite(b) && ((a === tbEm && b === tbEm) || (Math.max(a, b) === tbEm + 1 && Math.min(a, b) === tbEm));
  const showTb1 = Boolean(regrasBT) && tbHabilitado && (Boolean(formPlacar.tb1a.trim() || formPlacar.tb1b.trim()) || isTbScore(s1aN, s1bN));
  const showTb2 = Boolean(regrasBT) && tbHabilitado && (Boolean(formPlacar.tb2a.trim() || formPlacar.tb2b.trim()) || isTbScore(s2aN, s2bN));
  const camposSets: Array<{
    aKey: keyof FormPlacar;
    bKey: keyof FormPlacar;
    tbAKey?: keyof FormPlacar;
    tbBKey?: keyof FormPlacar;
  }> = [
    { aKey: "s1a", bKey: "s1b", tbAKey: "tb1a", tbBKey: "tb1b" },
    { aKey: "s2a", bKey: "s2b", tbAKey: "tb2a", tbBKey: "tb2b" },
    { aKey: "s3a", bKey: "s3b" },
    { aKey: "s4a", bKey: "s4b" },
    { aKey: "s5a", bKey: "s5b" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Arbitragem móvel</div>
                <h1 className="truncate text-xl font-bold text-slate-900">{categoria?.nome || "Categoria"}</h1>
                <p className="text-sm text-slate-600">{torneio?.nome || "Torneio"}</p>
              </div>
              <Link
                href={`/admin/torneios/${slug}/categorias/${categoriaId}/jogos`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {FASES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFase(item)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                    fase === item ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {LABEL_FASE[item]}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Chave</div>
                <select
                  value={filtroGrupoId}
                  onChange={(event) => setFiltroGrupoId(event.target.value)}
                  disabled={fase !== "GRUPOS"}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">Todas as chaves</option>
                  {gruposOptions.map((grupo) => (
                    <option key={grupo.id} value={grupo.id}>
                      {grupo.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Dupla</div>
                <select
                  value={filtroEquipeId}
                  onChange={(event) => setFiltroEquipeId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Todas as duplas</option>
                  {equipesOptions.map((equipe) => (
                    <option key={equipe.id} value={equipe.id}>
                      {equipe.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void carregarPartidas()}
                disabled={carregandoPartidas}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${carregandoPartidas ? "animate-spin" : ""}`} />
                Atualizar jogos
              </button>
              <button
                type="button"
                onClick={() => setMostrarClassificacao((atual) => !atual)}
                disabled={fase !== "GRUPOS"}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trophy className="h-4 w-4" />
                {mostrarClassificacao ? "Ocultar classificação" : "Mostrar classificação"}
                {mostrarClassificacao ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {flash ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{flash}</div> : null}
          {erro ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div> : null}

          {mostrarClassificacao ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Classificação</div>
                  <div className="text-xs text-slate-500">Acompanhe a pontuação sem ocupar espaço fixo na tela.</div>
                </div>
              </div>

              {classificacaoFiltrada.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                  Nenhuma classificação disponível.
                </div>
              ) : (
                <div className="space-y-3">
                  {classificacaoFiltrada.map((grupo) => (
                    <section key={grupo.grupoId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 text-sm font-bold text-slate-900">{grupo.grupoNome}</div>
                      <div className="space-y-2">
                        {grupo.equipes.map((equipe, index) => {
                          const destaque = filtroEquipeId && filtroEquipeId === equipe.equipeId;
                          return (
                            <div
                              key={equipe.equipeId}
                              className={`grid grid-cols-[28px_minmax(0,1fr)_44px_44px_54px] items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                                destaque ? "bg-blue-50 text-blue-900 ring-1 ring-blue-200" : "bg-white text-slate-700"
                              }`}
                            >
                              <div className="text-center font-bold text-slate-500">{index + 1}</div>
                              <div className="truncate font-semibold">{equipe.equipeNome || equipe.equipeId.slice(0, 8)}</div>
                              <div className="text-center font-bold">{equipe.pontos}</div>
                              <div className="text-center">{equipe.jogosVencidos}</div>
                              <div className="text-center">{equipe.saldoGames}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 grid grid-cols-[28px_minmax(0,1fr)_44px_44px_54px] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        <div className="text-center">#</div>
                        <div>Dupla</div>
                        <div className="text-center">Pts</div>
                        <div className="text-center">Vit</div>
                        <div className="text-center">Saldo</div>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-4">
            {carregandoBase && !categoria ? (
              <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-12 text-sm text-slate-500 shadow-sm">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando arbitragem...
              </div>
            ) : partidasFiltradas.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm">
                Nenhum jogo encontrado para os filtros selecionados.
              </div>
            ) : (
              partidasAgrupadas.map((grupo) => (
                <section key={grupo.titulo} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{grupo.titulo}</h2>
                    <span className="text-xs font-medium text-slate-500">{grupo.partidas.length} jogo(s)</span>
                  </div>

                  <div className="space-y-3">
                    {grupo.partidas.map((partida) => (
                      <article key={partida.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {partida.grupoNome || partida.rodadaNome || LABEL_FASE[partida.fase]}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatDataHora(partida.dataHorario) || (partida.dataLimite ? `Limite ${formatDataHora(partida.dataLimite)}` : "Sem horário")}
                              {partida.arenaNome ? ` • ${partida.arenaNome}${partida.quadra ? ` • Q. ${partida.quadra}` : ""}` : ""}
                            </div>
                          </div>
                          {getStatusBadge(partida.status, partida.dataHorario)}
                        </div>

                        <div className="space-y-2">
                          <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 ${partida.vencedorId === partida.equipeAId ? "bg-green-50" : "bg-slate-50"}`}>
                            <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{nomeEquipe(partida, "A")}</div>
                            <div className="rounded-lg bg-white px-2 py-1 text-sm font-bold text-slate-700 shadow-sm">
                              {partida.detalhesPlacar?.[0] ? partida.detalhesPlacar[0].a : "-"}
                            </div>
                          </div>
                          <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 ${partida.vencedorId === partida.equipeBId ? "bg-green-50" : "bg-slate-50"}`}>
                            <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{nomeEquipe(partida, "B")}</div>
                            <div className="rounded-lg bg-white px-2 py-1 text-sm font-bold text-slate-700 shadow-sm">
                              {partida.detalhesPlacar?.[0] ? partida.detalhesPlacar[0].b : "-"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          Placar completo: <span className="font-semibold text-slate-900">{formatPlacar(partida.detalhesPlacar)}</span>
                        </div>

                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => startEditPartida(partida)}
                            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            {partida.status === "FINALIZADA" || partida.status === "WO" ? "Editar placar" : "Informar placar"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>

      {partidaEditando ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center" onMouseDown={fecharModal}>
          <div
            className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Placar da partida</div>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {nomeEquipe(partidaEditando, "A")} <span className="text-slate-400">vs</span> {nomeEquipe(partidaEditando, "B")}
                </div>
              </div>
              <button type="button" onClick={fecharModal} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {camposSets.slice(0, melhorDe).map((campo, index) => {
                  const mostrarTb = index === 0 ? showTb1 : index === 1 ? showTb2 : false;
                  const label =
                    regrasVolei && index === melhorDe - 1 && regrasVolei.tieBreakDecisivo?.habilitado
                      ? `Set ${index + 1} (tie-break)`
                      : regrasBT && index === 2 && superTie
                        ? "Super tie"
                        : `Set ${index + 1}`;

                  return (
                    <section key={campo.aKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 text-sm font-semibold text-slate-800">{label}</div>
                      <div className="grid grid-cols-[1fr_24px_1fr] items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={formPlacar[campo.aKey]}
                          onChange={(event) => setFormPlacar((atual) => ({ ...atual, [campo.aKey]: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          placeholder="0"
                        />
                        <div className="text-center text-slate-400">x</div>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={formPlacar[campo.bKey]}
                          onChange={(event) => setFormPlacar((atual) => ({ ...atual, [campo.bKey]: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          placeholder="0"
                        />
                      </div>

                      {mostrarTb && campo.tbAKey && campo.tbBKey ? (
                        <div className="mt-3">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tie-break</div>
                          <div className="grid grid-cols-[1fr_24px_1fr] items-center gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={formPlacar[campo.tbAKey]}
                              onChange={(event) => setFormPlacar((atual) => ({ ...atual, [campo.tbAKey!]: event.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-base font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              placeholder="0"
                            />
                            <div className="text-center text-slate-400">x</div>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={formPlacar[campo.tbBKey]}
                              onChange={(event) => setFormPlacar((atual) => ({ ...atual, [campo.tbBKey!]: event.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-base font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                {(partidaEditando.status === "FINALIZADA" || partidaEditando.status === "WO") && (
                  <button
                    type="button"
                    onClick={() => void cancelarPlacar(partidaEditando)}
                    disabled={salvandoPartida}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Limpar placar
                  </button>
                )}
                <button
                  type="button"
                  onClick={fecharModal}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void salvarPlacar(partidaEditando)}
                  disabled={salvandoPartida}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {salvandoPartida ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {salvandoPartida ? "Salvando..." : "Salvar placar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
