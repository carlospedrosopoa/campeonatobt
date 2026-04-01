"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Banknote, Calendar, Clock, Crown, FileText, Gamepad2, ImageIcon, MapPin, Network, Pencil, Save, Swords, Trophy, Trash2, X } from "lucide-react";
import { gerarCardPartidaAdmin } from "@/lib/match-card-client";

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
  grupos?: { modo: "AUTO" | "MANUAL"; tamanhoAlvo: 3 | 4; quantidade?: number };
  classificacao?: { porGrupo: number; melhoresTerceiros?: number };
  fase2?: { habilitada: boolean; temFinal: boolean };
  regrasPartida?: {
    tipo: "SETS";
    melhorDe: 1 | 3;
    gamesPorSet: 4 | 6;
    tiebreak: { habilitado: boolean; em: number; ate: number; diffMin: number };
    superTiebreakDecisivo?: { habilitado: boolean; ate: number; diffMin: number };
    incluirSuperTieEmGames?: boolean;
  };
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
    setsPro?: number;
  }[];
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
  arenaLogoUrl?: string | null;
  quadra?: string | null;
  dataHorario?: string | null;
  dataLimite?: string | null;
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

type ResultadoFinal = { campeao: string; vice: string } | null;

type Inscricao = { status: string; equipe: { id: string; nome: string | null } };
type Arena = { id: string; nome: string; logoUrl?: string | null };

function ordinalRodada(n: number) {
  return `${n}ª Rodada`;
}

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

export default function AdminCategoriaJogosSuperPage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [config, setConfig] = useState<CategoriaConfig | null>(null);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [gerandoGrupos, setGerandoGrupos] = useState(false);
  const [gerandoRodadasRestantes, setGerandoRodadasRestantes] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [gerandoMataMata, setGerandoMataMata] = useState(false);
  const [resetando, setResetando] = useState(false);

  const [classificacao, setClassificacao] = useState<GrupoClassificacao[]>([]);

  const [fase, setFase] = useState<"GRUPOS" | "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL">("GRUPOS");
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [carregandoPartidas, setCarregandoPartidas] = useState(false);
  const [temResultadoGrupos, setTemResultadoGrupos] = useState(false);

  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal>(null);

  const [editPartidaId, setEditPartidaId] = useState<string | null>(null);
  const [salvandoPartida, setSalvandoPartida] = useState(false);
  const [editConfrontoId, setEditConfrontoId] = useState<string | null>(null);
  const [salvandoConfronto, setSalvandoConfronto] = useState(false);
  const [equipes, setEquipes] = useState<{ id: string; nome: string }[]>([]);
  const [carregandoEquipes, setCarregandoEquipes] = useState(false);
  const [confrontoEquipeAId, setConfrontoEquipeAId] = useState("");
  const [confrontoEquipeBId, setConfrontoEquipeBId] = useState("");
  const [modoManutencaoConfronto, setModoManutencaoConfronto] = useState(true);
  const [editAgendamentoId, setEditAgendamentoId] = useState<string | null>(null);
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [carregandoArenas, setCarregandoArenas] = useState(false);
  const [agendaArenaId, setAgendaArenaId] = useState("");
  const [agendaQuadra, setAgendaQuadra] = useState("");
  const [agendaDataHorario, setAgendaDataHorario] = useState("");
  const [agendaDataLimite, setAgendaDataLimite] = useState("");
  const [editRodadaId, setEditRodadaId] = useState<string | null>(null);
  const [rodadaDataLimite, setRodadaDataLimite] = useState("");
  const [salvandoRodada, setSalvandoRodada] = useState(false);
  const [torneioNome, setTorneioNome] = useState("Torneio");
  const [torneioTemplateUrl, setTorneioTemplateUrl] = useState<string | null>(null);
  const [torneioBannerUrl, setTorneioBannerUrl] = useState<string | null>(null);
  const [gerandoRelatorioClassificacao, setGerandoRelatorioClassificacao] = useState(false);
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

  async function carregarCategoria() {
    const resCat = await fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" });
    if (!resCat.ok) {
      const msg = await resCat.json().catch(() => null);
      throw new Error(msg?.error || "Falha ao carregar categoria");
    }
    const cats = (await resCat.json()) as Categoria[];
    return cats.find((c) => c.id === categoriaId) ?? null;
  }

  async function carregarTorneio() {
    const res = await fetch(`/api/v1/torneios/${slug}`, { cache: "no-store" });
    if (!res.ok) return;
    const t = (await res.json()) as any;
    if (t?.nome) setTorneioNome(String(t.nome));
    setTorneioTemplateUrl((t?.templateUrl as string | null | undefined) ?? null);
    setTorneioBannerUrl((t?.bannerUrl as string | null | undefined) ?? null);
  }

  async function gerarRelatorioClassificacao() {
    if (!categoria) return;
    if (classificacao.length === 0) {
      alert("Nenhuma classificação disponível para gerar relatório.");
      return;
    }

    try {
      setGerandoRelatorioClassificacao(true);

      const escapeHtml = (value: string) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const avatarPlaceholder =
        "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiNlMmU4ZjAiLz48dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtc2l6ZT0iMzUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmaWxsPSIjOTRhN2IzIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXdlaWdodD0iYm9sZCI+UE48L3RleHQ+PC9zdmc+";

      const resPartidas = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=GRUPOS`, { cache: "no-store" });
      const partidasGrupos = (resPartidas.ok ? ((await resPartidas.json()) as Partida[]) : []) ?? [];

      const equipeAtletas = new Map<string, { id: string; nome: string; fotoUrl?: string | null }[]>();
      for (const p of partidasGrupos) {
        if (p.equipeAId && p.equipeAAtletas?.length) equipeAtletas.set(p.equipeAId, p.equipeAAtletas);
        if (p.equipeBId && p.equipeBAtletas?.length) equipeAtletas.set(p.equipeBId, p.equipeBAtletas);
      }

      const bannerHtml = torneioBannerUrl
        ? `<div class="mb-8 w-full"><img src="/api/image-proxy?url=${encodeURIComponent(torneioBannerUrl)}" class="w-full h-auto rounded-2xl shadow-sm" crossOrigin="anonymous" /></div>`
        : "";

      const gruposHtml = classificacao
        .map((g) => {
          const rowsHtml = g.equipes
            .map((e, idx) => {
              const atletas = equipeAtletas.get(e.equipeId) ?? [];
              const a1 = atletas[0];
              const a2 = atletas[1];
              const foto1 = a1?.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a1.fotoUrl)}` : avatarPlaceholder;
              const foto2 = a2?.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a2.fotoUrl)}` : avatarPlaceholder;
              const nome1 = escapeHtml(a1?.nome || "");
              const nome2 = escapeHtml(a2?.nome || "");
              const equipeNome = escapeHtml(e.equipeNome || e.equipeId.slice(0, 8));

              const destaque =
                idx === 0
                  ? "bg-gradient-to-r from-amber-50 to-white border-amber-100"
                  : idx === 1
                    ? "bg-gradient-to-r from-slate-50 to-white border-slate-100"
                    : "bg-white border-slate-100";

              return `
                <div class="flex items-center justify-between gap-4 rounded-xl border ${destaque} px-4 py-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-900 text-white text-sm font-black">${idx + 1}</div>
                    <div class="flex items-center -space-x-2">
                      <img src="${foto1}" class="h-10 w-10 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm" onerror="this.src='${avatarPlaceholder}'" crossOrigin="anonymous" />
                      <img src="${foto2}" class="h-10 w-10 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm" onerror="this.src='${avatarPlaceholder}'" crossOrigin="anonymous" />
                    </div>
                    <div class="min-w-0">
                      <div class="font-bold text-slate-900 truncate">${equipeNome}</div>
                      <div class="text-xs text-slate-500 truncate">${[nome1, nome2].filter(Boolean).join(" / ")}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-4">
                    <div class="text-center">
                      <div class="text-[10px] font-bold text-slate-400">PTS</div>
                      <div class="text-lg font-black text-slate-900">${e.pontos}</div>
                    </div>
                    <div class="hidden sm:block text-center">
                      <div class="text-[10px] font-bold text-slate-400">V</div>
                      <div class="text-base font-bold text-slate-700">${e.jogosVencidos}</div>
                    </div>
                    <div class="hidden sm:block text-center">
                      <div class="text-[10px] font-bold text-slate-400">SP</div>
                      <div class="text-base font-bold text-slate-700">${e.setsPro ?? 0}</div>
                    </div>
                    <div class="text-center">
                      <div class="text-[10px] font-bold text-slate-400">SG</div>
                      <div class="text-base font-bold ${e.saldoGames >= 0 ? "text-green-700" : "text-red-700"}">${e.saldoGames}</div>
                    </div>
                    <div class="text-center">
                      <div class="text-[10px] font-bold text-slate-400">AP%</div>
                      <div class="text-base font-bold text-slate-700">${e.jogosJogados > 0 ? Math.round((e.pontos / (e.jogosJogados * 3)) * 100) : 0}%</div>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("");

          return `
            <section class="mb-8">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-sm font-black tracking-wider uppercase text-slate-700">${escapeHtml(g.grupoNome)}</h2>
                <div class="text-xs text-slate-400 font-semibold">Classificação</div>
              </div>
              <div class="space-y-2">${rowsHtml}</div>
            </section>
          `;
        })
        .join("");

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Classificação - ${escapeHtml(categoria.nome)} - ${escapeHtml(torneioNome)}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
          <style>
            @media print { .no-print { display: none; } body { padding: 0; margin: 0; } }
            body { background-color: #f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, Noto Sans, sans-serif; }
            #capture-target { padding: 2rem; background: #f8fafc; }
          </style>
          <script>
            async function gerarImagem() {
              const btn = document.getElementById('btn-gerar-imagem');
              const originalText = btn.innerText;
              try {
                btn.innerText = 'Processando...';
                btn.disabled = true;
                await new Promise(r => setTimeout(r, 700));
                const element = document.getElementById('capture-target');
                const canvas = await html2canvas(element, { useCORS: true, scale: 2, backgroundColor: '#f8fafc', logging: false });
                const link = document.createElement('a');
                link.download = 'classificacao-${encodeURIComponent(categoria.nome)}.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
              } catch (err) { alert('Erro ao gerar imagem.'); } finally { btn.innerText = originalText; btn.disabled = false; }
            }
          </script>
        </head>
        <body class="p-4 md:p-8">
          <div class="max-w-4xl mx-auto">
            <div class="no-print flex justify-end gap-3 mb-6">
              <button id="btn-gerar-imagem" onclick="gerarImagem()" class="bg-orange-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-600">Gerar Imagem (PNG)</button>
              <button onclick="window.print()" class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium">Imprimir</button>
            </div>
            <div id="capture-target" class="rounded-3xl shadow-xl border border-slate-100 bg-slate-50">
              <div class="p-6 md:p-8">
                ${bannerHtml}
                <div class="mb-8">
                  <div class="text-xs font-black tracking-widest uppercase text-slate-400">Play Na Quadra</div>
                  <h1 class="text-3xl font-black text-slate-900 leading-tight">${escapeHtml(torneioNome)}</h1>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center rounded-full bg-slate-900 text-white px-3 py-1 text-xs font-bold">${escapeHtml(categoria.nome)}</span>
                    <span class="text-xs text-slate-500 font-semibold">Classificação</span>
                    <span class="text-xs text-slate-400">•</span>
                    <span class="text-xs text-slate-500 font-semibold">${new Date().toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                ${gruposHtml}
                <footer class="mt-10 pt-6 border-t border-slate-200 text-center text-slate-400 text-xs font-semibold">
                  Gerado por Play Na Quadra
                </footer>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(htmlContent);
        win.document.close();
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao gerar relatório da classificação");
    } finally {
      setGerandoRelatorioClassificacao(false);
    }
  }

  async function carregarConfigEClassificacao() {
    const [resConfig, resClass] = await Promise.all([
      fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/config`, { cache: "no-store" }),
      fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" }),
    ]);

    if (resConfig.ok) setConfig((await resConfig.json()) as CategoriaConfig);
    if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
  }

  async function carregarPartidas(faseParam?: typeof fase) {
    try {
      setCarregandoPartidas(true);
      const faseQuery = faseParam ?? fase;
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas?fase=${faseQuery}`, { cache: "no-store" });
      if (!res.ok) return;
      const lista = (await res.json()) as Partida[];
      setPartidas(lista);
      if (faseQuery === "GRUPOS") {
        const iniciada = lista.some((p) => {
          if (p.status && p.status !== "AGENDADA") return true;
          if (p.vencedorId) return true;
          if ((p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0) return true;
          if (Array.isArray(p.detalhesPlacar) && p.detalhesPlacar.length > 0) return true;
          return false;
        });
        setTemResultadoGrupos(iniciada);
      }
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
        await carregarTorneio();
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
  }, [slug, categoriaId]);

  useEffect(() => {
    void carregarPartidas();
  }, [slug, categoriaId, fase]);

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
    if (!editAgendamentoId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditAgendamentoId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editAgendamentoId]);

  useEffect(() => {
    if (!editRodadaId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditRodadaId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editRodadaId]);

  const titulo = useMemo(() => (categoria ? `Jogos — ${categoria.nome} (Super Campeonato)` : "Jogos (Super Campeonato)"), [categoria]);

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

  function formatData(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    // Ajuste para exibir a data correta independente do fuso horário (usa UTC pois salvamos como UTC midnight)
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  }

  function formatDataHora(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const hour = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month} às ${hour}:${minute}`;
  }

  function startEditPartida(p: Partida) {
    const det = (p.detalhesPlacar ?? []).slice().sort((a, b) => a.set - b.set);
    setEditPartidaId(p.id);
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

  async function abrirAlterarConfronto(p: Partida) {
    setEditConfrontoId(p.id);
    setConfrontoEquipeAId(p.equipeAId);
    setConfrontoEquipeBId(p.equipeBId);
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

  function toLocalDateInput(value: string | null | undefined) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    // Ajuste para input date: usar UTC para evitar o deslocamento de fuso (D-1)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  function toLocalDateTimeInput(value: string | null | undefined) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function abrirEditarRodada(rodadaId: string | null, dataLimiteAtual: string | null | undefined) {
    if (!rodadaId) return;
    setEditRodadaId(rodadaId);
    setRodadaDataLimite(toLocalDateInput(dataLimiteAtual));
  }

  async function gerarCardPartida(p: Partida) {
    try {
      setErro(null);
      await gerarCardPartidaAdmin({
        torneioNome,
        categoriaNome: categoria?.nome || "Categoria",
        templateUrl: torneioTemplateUrl,
        syncFotosUrl: `/api/public/torneios/${slug}/categorias/${categoriaId}/partidas/${p.id}/sincronizar-fotos`,
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
    } catch (e: any) {
      setErro(e?.message || "Não foi possível gerar o card da partida");
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

  async function salvarPlacar(p: Partida) {
    try {
      setSalvandoPartida(true);
      setErro(null);

      const regras = config?.regrasPartida;
      const melhorDe = 3;
      const superTie = true;
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

      if (fase === "GRUPOS") {
        await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
        const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
        if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
      }

      const proximaFaseCriada = payload?.proximaFaseCriada as string | null;
      if (proximaFaseCriada) {
        setFase(proximaFaseCriada as any);
        await carregarPartidas(proximaFaseCriada as any);
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
      setFase("GRUPOS");
      alert("Jogos resetados com sucesso!");
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setResetando(false);
    }
  }

  const rodadasView = useMemo(() => {
    if (fase !== "GRUPOS") return [];
    const map = new Map<number, Partida[]>();
    for (const p of partidas) {
      const n = p.rodadaNumero ?? 0;
      const list = map.get(n) ?? [];
      list.push(p);
      map.set(n, list);
    }
    return Array.from(map.entries())
      .filter(([n]) => n > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([numero, jogos]) => ({
        numero,
        jogos,
        rodadaId: jogos[0]?.rodadaId,
        dataLimite: jogos[0]?.dataLimite,
      }));
  }, [partidas, fase]);

  const temResultadoNaCategoria = useMemo(() => {
    if (temResultadoGrupos) return true;
    for (const g of classificacao) {
      for (const e of g.equipes) {
        if ((e.jogosJogados ?? 0) > 0) return true;
        if ((e.jogosVencidos ?? 0) > 0) return true;
        if ((e.jogosPerdidos ?? 0) > 0) return true;
        if ((e.pontos ?? 0) > 0) return true;
        if ((e.saldoGames ?? 0) !== 0) return true;
        if ((e.setsPro ?? 0) > 0) return true;
      }
    }
    return false;
  }, [classificacao, temResultadoGrupos]);

  const melhorDe = 3;
  const superTie = true;
  const tbHabilitado = config?.regrasPartida?.tiebreak?.habilitado ?? true;
  const tbEm = config?.regrasPartida?.tiebreak?.em ?? (config?.regrasPartida?.gamesPorSet ?? 6);
  const isTbScore = (a: number, b: number) =>
    Number.isFinite(a) && Number.isFinite(b) && ((a === tbEm && b === tbEm) || (Math.max(a, b) === tbEm + 1 && Math.min(a, b) === tbEm));

  const s1aN = Number(formPlacar.s1a);
  const s1bN = Number(formPlacar.s1b);
  const s2aN = Number(formPlacar.s2a);
  const s2bN = Number(formPlacar.s2b);
  const showTb1 = tbHabilitado && (Boolean(formPlacar.tb1a.trim() || formPlacar.tb1b.trim()) || isTbScore(s1aN, s1bN));
  const showTb2 = tbHabilitado && (Boolean(formPlacar.tb2a.trim() || formPlacar.tb2b.trim()) || isTbScore(s2aN, s2bN));

  if (carregando) return <div className="text-sm text-slate-600">Carregando…</div>;

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
              Critério: Pontos → Vitórias → Sets pró → Saldo de games (super tie não conta)
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

        <div className="flex items-center gap-2">
          <select
            value={fase}
            onChange={(e) => setFase(e.target.value as any)}
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
            <h2 className="text-xl font-bold text-slate-900">Dinâmica</h2>
            <p className="text-sm text-slate-600">Gere rodadas e acompanhe por rodada.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-xs text-slate-500">Pontuação: 2-0 = 3 • 2-1 = 2/1 • 1 set: 3 (sem TB) • 2/1 (com TB)</div>
          <div className="flex items-center gap-2">
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
              disabled={gerandoRelatorioClassificacao || classificacao.length === 0}
              onClick={gerarRelatorioClassificacao}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Relatório da classificação (com banner e PNG)"
            >
              <FileText className="h-4 w-4" />
              {gerandoRelatorioClassificacao ? "Gerando…" : "Relatório classificação"}
            </button>

            <button
              type="button"
              disabled={gerandoGrupos || temResultadoNaCategoria}
              onClick={async () => {
                try {
                  setGerandoGrupos(true);
                  const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/gerar-grupos`, { method: "POST" });
                  if (!res.ok) {
                    const msg = await res.json().catch(() => null);
                    throw new Error(msg?.error || "Falha ao gerar rodadas/jogos");
                  }
                  const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
                  if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
                  setFase("GRUPOS");
                  await carregarPartidas("GRUPOS");
                } catch (e: any) {
                  setErro(e?.message || "Erro inesperado");
                } finally {
                  setGerandoGrupos(false);
                }
              }}
              title={temResultadoNaCategoria ? "Não é possível gerar jogos: já existe partida com resultado ou em andamento." : undefined}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {gerandoGrupos ? "Gerando…" : "Gerar rodadas/jogos"}
            </button>

            <button
              type="button"
              disabled={gerandoRodadasRestantes || !temResultadoGrupos}
              onClick={async () => {
                try {
                  setGerandoRodadasRestantes(true);
                  setErro(null);
                  const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/gerar-rodadas-restantes`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ aPartirDaRodada: 2 }),
                  });
                  const payload = (await res.json().catch(() => null)) as any;
                  if (!res.ok) throw new Error(payload?.error || "Falha ao gerar rodadas restantes");
                  const resClass = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/classificacao`, { cache: "no-store" });
                  if (resClass.ok) setClassificacao((await resClass.json()) as GrupoClassificacao[]);
                  setFase("GRUPOS");
                  await carregarPartidas("GRUPOS");
                  alert(`Rodadas restantes geradas.\n\nRodadas: ${payload?.maxRodadas ?? "-"}\nPartidas criadas: ${payload?.partidasCriadas ?? 0}`);
                } catch (e: any) {
                  setErro(e?.message || "Erro inesperado");
                } finally {
                  setGerandoRodadasRestantes(false);
                }
              }}
              title={
                !temResultadoGrupos
                  ? "Use quando já existe resultado na 1ª rodada e você precisa gerar as rodadas seguintes mantendo a 1ª."
                  : undefined
              }
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {gerandoRodadasRestantes ? "Gerando…" : "Gerar rodadas restantes"}
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
                    setFase(payload.fase);
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
            <div className="text-sm text-slate-600">Nenhuma classificação disponível (gere jogos e/ou recalcule).</div>
          ) : (
            classificacao.map((g) => (
              <div key={g.grupoId} className="rounded-lg border border-slate-200 p-4">
                <div className="font-semibold text-slate-900 mb-3">{g.grupoNome}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100">
                        <th className="py-2 pr-3 font-medium">Equipe</th>
                        <th className="py-2 pr-3 font-medium">P</th>
                        <th className="py-2 pr-3 font-medium">J</th>
                        <th className="py-2 pr-3 font-medium">V</th>
                        <th className="py-2 pr-3 font-medium">SP</th>
                        <th className="py-2 pr-3 font-medium">SG</th>
                        <th className="py-2 pr-3 font-medium">AP%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.equipes.map((e) => (
                        <tr key={e.equipeId} className="border-b border-slate-50">
                          <td className="py-2 pr-3 font-medium text-slate-900">{e.equipeNome || e.equipeId.slice(0, 8)}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.pontos}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.jogosJogados}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.jogosVencidos}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.setsPro ?? 0}</td>
                          <td className="py-2 pr-3 text-slate-700">{e.saldoGames}</td>
                          <td className="py-2 pr-3 text-slate-700">
                            {e.jogosJogados > 0 ? `${Math.round((e.pontos / (e.jogosJogados * 3)) * 100)}%` : "0%"}
                          </td>
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

      {fase === "GRUPOS" ? (
        <div className="space-y-4">
          {rodadasView.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-sm text-slate-600">Nenhuma rodada encontrada.</div>
          ) : (
            rodadasView.map((r) => (
              <div key={r.numero} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Rodada</div>
                    <div className="text-xl font-bold text-slate-900">{ordinalRodada(r.numero)}</div>
                    {r.dataLimite && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                        <Clock className="h-3 w-3" />
                        Limite: {formatData(r.dataLimite)}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => abrirEditarRodada(r.rodadaId ?? null, r.dataLimite)}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Definir limite
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {r.jogos.map((p) => (
                    <div key={p.id} className="group relative flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-md">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide text-slate-600">
                              {p.grupoNome ?? "Grupo"}
                            </span>
                            {p.arenaNome ? (
                              <span className="flex items-center gap-1">
                                {p.arenaLogoUrl ? <img src={p.arenaLogoUrl} alt={p.arenaNome ?? "Arena"} className="h-4 w-4 rounded-full object-cover" /> : null}
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
                            <div className="font-bold text-slate-900 leading-tight">
                              {p.equipeANome || p.equipeAId.slice(0, 8)}
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center justify-center min-w-[3rem]">
                            <span className="text-lg font-bold text-slate-900 font-mono tracking-tight bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                              {formatPlacar(p.detalhesPlacar)}
                            </span>
                          </div>

                          <div className="flex-1 text-left">
                            <div className="font-bold text-slate-900 leading-tight">
                              {p.equipeBNome || p.equipeBId.slice(0, 8)}
                            </div>
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
                              {p.dataLimite ? `Limite: ${formatData(p.dataLimite)}` : "Sem agendamento"}
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
                            onClick={() => abrirAgendamento(p)}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                            title="Agendar"
                          >
                            <Calendar className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditPartida(p)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
                          >
                            Lançar placar
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirAlterarConfronto(p)}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                            title="Alterar confronto"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Partidas</h2>
              <p className="text-sm text-slate-600">Fase {fase}.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partidas.length === 0 ? (
              <div className="col-span-full py-10 text-center text-slate-500">
                Nenhuma partida encontrada.
              </div>
            ) : (
              partidas.map((p) => (
                <div key={p.id} className="group relative flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        {p.arenaNome ? (
                              <span className="flex items-center gap-1">
                                {p.arenaLogoUrl ? <img src={p.arenaLogoUrl} alt={p.arenaNome ?? "Arena"} className="h-4 w-4 rounded-full object-cover" /> : null}
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
                        <div className="font-bold text-slate-900 leading-tight">
                          {p.equipeANome || p.equipeAId.slice(0, 8)}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center justify-center min-w-[3rem]">
                        <span className="text-lg font-bold text-slate-900 font-mono tracking-tight bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                          {formatPlacar(p.detalhesPlacar)}
                        </span>
                      </div>

                      <div className="flex-1 text-left">
                        <div className="font-bold text-slate-900 leading-tight">
                          {p.equipeBNome || p.equipeBId.slice(0, 8)}
                        </div>
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
                              {p.dataLimite ? `Limite: ${formatData(p.dataLimite)}` : "Sem agendamento"}
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
                        onClick={() => abrirAgendamento(p)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                        title="Agendar"
                      >
                        <Calendar className="h-4 w-4" />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => startEditPartida(p)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
                      >
                        Lançar placar
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => abrirAlterarConfronto(p)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                        title="Alterar confronto"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {editRodadaId &&
        (() => {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditRodadaId(null)}>
              <div
                className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider">Editar rodada</div>
                      <div className="text-lg font-bold text-slate-900">Definir data limite</div>
                      <div className="text-sm text-slate-600 mt-1">
                        Isso atualizará a data limite de todos os jogos desta rodada.
                      </div>
                    </div>
                    <button type="button" onClick={() => setEditRodadaId(null)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                      <X className="h-4 w-4" />
                      Fechar
                    </button>
                  </div>

                  <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Data limite</label>
                      <input
                        value={rodadaDataLimite}
                        onChange={(e) => setRodadaDataLimite(e.target.value)}
                        type="date"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                      />
                    </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditRodadaId(null)}
                      className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setSalvandoRodada(true);
                          setErro(null);
                          const toIso = (v: string) => (v.trim() ? new Date(v).toISOString() : null);
                          const res = await fetch(
                            `/api/v1/torneios/${slug}/categorias/${categoriaId}/rodadas/${editRodadaId}`,
                            {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                dataLimite: toIso(rodadaDataLimite),
                              }),
                            }
                          );
                          const payload = (await res.json().catch(() => null)) as any;
                          if (!res.ok) throw new Error(payload?.error || "Falha ao salvar rodada");
                          await carregarPartidas();
                          setEditRodadaId(null);
                        } catch (e: any) {
                          setErro(e?.message || "Erro inesperado");
                        } finally {
                          setSalvandoRodada(false);
                        }
                      }}
                      disabled={salvandoRodada}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {salvandoRodada ? "Salvando…" : "Salvar"}
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
          const started =
            partida.status !== "AGENDADA" ||
            Boolean(partida.vencedorId) ||
            (partida.placarA ?? 0) !== 0 ||
            (partida.placarB ?? 0) !== 0 ||
            (Array.isArray(partida.detalhesPlacar) && partida.detalhesPlacar.length > 0);
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
                        {partida.fase === "GRUPOS"
                          ? started
                            ? "Este jogo já possui placar/andamento. A alteração mantém o placar e troca as duplas."
                            : "A alteração troca as duplas deste jogo."
                          : "Disponível apenas para jogos sem placar no mata-mata."}
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

                  {partida.fase === "GRUPOS" && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm text-slate-700">
                        Modo manutenção: permite trocar duplas mesmo que fiquem repetidas temporariamente (corrija antes de gerar rodadas restantes).
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
                          if (partida.fase !== "GRUPOS" && started) {
                            throw new Error("Não é possível alterar confronto no mata-mata após iniciar/lançar placar");
                          }
                          if (partida.fase === "GRUPOS" && started) {
                            const ok = confirm("Este jogo já tem placar/andamento. Alterar o confronto manterá o placar atual e trocará as duplas. Continuar?");
                            if (!ok) return;
                          }
                          const res = await fetch(
                            `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partida.id}/alterar-confronto`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                equipeAId: confrontoEquipeAId,
                                equipeBId: confrontoEquipeBId,
                                force: partida.fase === "GRUPOS" && (started || modoManutencaoConfronto),
                                preservarPlacar: partida.fase === "GRUPOS" && started,
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

      {editAgendamentoId &&
        (() => {
          const partida = partidas.find((p) => p.id === editAgendamentoId);
          if (!partida) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditAgendamentoId(null)}>
              <div
                className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg max-h-[85vh] overflow-y-auto"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider">Agendamento</div>
                      <div className="text-lg font-bold text-slate-900">
                        {partida.equipeANome || partida.equipeAId.slice(0, 8)} <span className="text-slate-400">vs</span>{" "}
                        {partida.equipeBNome || partida.equipeBId.slice(0, 8)}
                      </div>
                    </div>
                    <button type="button" onClick={() => setEditAgendamentoId(null)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                      <X className="h-4 w-4" />
                      Fechar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Arena</label>
                      <select
                        value={agendaArenaId}
                        onChange={(e) => setAgendaArenaId(e.target.value)}
                        disabled={carregandoArenas}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white disabled:opacity-50"
                      >
                        <option value="">{arenas.length === 0 ? "Nenhuma arena disponível" : "Selecione uma arena"}</option>
                        {arenas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome}
                          </option>
                        ))}
                      </select>
                      {agendaArenaId && arenas.find((a) => a.id === agendaArenaId)?.logoUrl ? (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <img
                            src={arenas.find((a) => a.id === agendaArenaId)?.logoUrl || ""}
                            alt={arenas.find((a) => a.id === agendaArenaId)?.nome || "Arena"}
                            className="h-5 w-5 rounded-full object-cover"
                          />
                          {arenas.find((a) => a.id === agendaArenaId)?.nome}
                        </div>
                      ) : null}
                      <div className="text-xs text-slate-500">
                        Cadastre arenas em <Link href={`/admin/torneios/${slug}/arenas`} className="underline">Arenas</Link>.
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Quadra (opcional)</label>
                      <input
                        value={agendaQuadra}
                        onChange={(e) => setAgendaQuadra(e.target.value)}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                        placeholder="Ex: Quadra 1"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Data e horário agendados</label>
                      <input
                        value={agendaDataHorario}
                        onChange={(e) => setAgendaDataHorario(e.target.value)}
                        type="datetime-local"
                        step={60}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Data limite</label>
                      <input
                        value={agendaDataLimite}
                        onChange={(e) => setAgendaDataLimite(e.target.value)}
                        type="date"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                      />
                    </div>
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
                      onClick={async () => {
                        try {
                          setSalvandoAgendamento(true);
                          setErro(null);
                          if (agendaDataHorario.trim() && !agendaArenaId) throw new Error("Selecione uma arena para agendar a partida");
                          const toIsoDateTime = (v: string) => (v.trim() ? new Date(v).toISOString() : null);
                          const toIsoDate = (v: string) => (v.trim() ? new Date(`${v}T00:00:00`).toISOString() : null);
                          const res = await fetch(
                            `/api/v1/torneios/${slug}/categorias/${categoriaId}/partidas/${partida.id}/agendamento`,
                            {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                arenaId: agendaArenaId || null,
                                quadra: agendaQuadra.trim() || null,
                                dataHorario: toIsoDateTime(agendaDataHorario),
                                dataLimite: toIsoDate(agendaDataLimite),
                              }),
                            }
                          );
                          const payload = (await res.json().catch(() => null)) as any;
                          if (!res.ok) throw new Error(payload?.error || "Falha ao salvar agendamento");
                          await carregarPartidas();
                          setEditAgendamentoId(null);
                        } catch (e: any) {
                          setErro(e?.message || "Erro inesperado");
                        } finally {
                          setSalvandoAgendamento(false);
                        }
                      }}
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

      {editPartidaId &&
        (() => {
          const partida = partidas.find((p) => p.id === editPartidaId);
          if (!partida) return null;
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
                    {fase !== "GRUPOS" && (partida.status === "FINALIZADA" || partida.status === "WO") && (
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
    </div>
  );
}
