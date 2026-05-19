"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Calendar, FileText, ImageIcon, Loader2, MapPin, Pencil, RefreshCw, Save, Users, X } from "lucide-react";
import { gerarCardPartidaAdmin } from "@/lib/match-card-client";

type Partida = {
  id: string;
  fase: string;
  status: string;
  categoriaId: string;
  categoriaNome: string;
  arenaNome?: string | null;
  arenaLogoUrl?: string | null;
  quadra?: string | null;
  dataHorario?: string | null;
  fotoUrl?: string | null;
  equipeAId: string;
  equipeANome: string | null;
  equipeAAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
  equipeBId: string;
  equipeBNome: string | null;
  equipeBAtletas?: { id: string; nome: string; fotoUrl?: string | null }[];
  placarA: number;
  placarB: number;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

type Torneio = {
  id: string;
  nome: string;
  bannerUrl: string | null;
  templateUrl: string | null;
};

type PlacarForm = {
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
};

const avatarPlaceholder =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiNlMmU4ZjAiLz48dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtc2l6ZT0iMzUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmaWxsPSIjOTRhN2IzIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXdlaWdodD0iYm9sZCI+UE48L3RleHQ+PC9zdmc+";

function fotoSrc(url?: string | null) {
  const v = (url || "").replace(/[`'"\s]/g, "").trim();
  if (!v) return avatarPlaceholder;
  if (v.startsWith("data:image/")) return v;
  if (v.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(v)) return `data:image/jpeg;base64,${v.replaceAll(/\s+/g, "")}`;
  return `/api/image-proxy?url=${encodeURIComponent(v)}`;
}

const getStatusBadge = (status: string) => {
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

function ymdSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function datePtBrFromYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0, 0));
  return dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function AdminJogosDoDiaPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [torneio, setTorneio] = useState<Torneio | null>(null);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [sincronizandoFotos, setSincronizandoFotos] = useState(false);
  const [atualizandoPlacares, setAtualizandoPlacares] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState(() => ymdSaoPaulo());
  const [atletasAtualizando, setAtletasAtualizando] = useState<Record<string, boolean>>({});

  const [editPartida, setEditPartida] = useState<Partida | null>(null);
  const [salvandoPlacar, setSalvandoPlacar] = useState(false);
  const [erroPlacar, setErroPlacar] = useState<string | null>(null);
  const [formPlacar, setFormPlacar] = useState<PlacarForm>({
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

  async function carregarDados(dataYmd?: string) {
    try {
      setCarregando(true);
      setErro(null);

      const dataRef = (dataYmd || "").trim() || ymdSaoPaulo();
      const res = await fetch(`/api/v1/torneios/${slug}/jogos-do-dia?data=${dataRef}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar jogos do dia");

      const payload = (await res.json().catch(() => null)) as { torneio: Torneio; partidas: Partida[] } | null;
      if (!payload?.torneio) throw new Error("Resposta inválida do servidor");
      setTorneio(payload.torneio);
      setPartidas(payload.partidas || []);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarDados(dataSelecionada);
  }, [slug, dataSelecionada]);

  useEffect(() => {
    if (!editPartida) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditPartida(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [editPartida]);

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

  function textoPlacar(p: Partida) {
    if (p.detalhesPlacar && p.detalhesPlacar.length > 0) return formatPlacar(p.detalhesPlacar);
    if ((p.placarA ?? 0) > 0 || (p.placarB ?? 0) > 0) return `${p.placarA ?? 0} x ${p.placarB ?? 0}`;
    return null;
  }

  function formatDataHora(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function abrirModalPlacar(p: Partida) {
    setErroPlacar(null);
    const detalhes = Array.isArray(p.detalhesPlacar) ? p.detalhesPlacar.slice().sort((a, b) => a.set - b.set) : [];
    const s1 = detalhes.find((d) => d.set === 1);
    const s2 = detalhes.find((d) => d.set === 2);
    const s3 = detalhes.find((d) => d.set === 3);
    setFormPlacar({
      s1a: s1 ? String(s1.a ?? "") : "",
      s1b: s1 ? String(s1.b ?? "") : "",
      tb1a: s1 && s1.tiebreak ? String(s1.tbA ?? "") : "",
      tb1b: s1 && s1.tiebreak ? String(s1.tbB ?? "") : "",
      s2a: s2 ? String(s2.a ?? "") : "",
      s2b: s2 ? String(s2.b ?? "") : "",
      tb2a: s2 && s2.tiebreak ? String(s2.tbA ?? "") : "",
      tb2b: s2 && s2.tiebreak ? String(s2.tbB ?? "") : "",
      s3a: s3 ? String(s3.a ?? "") : "",
      s3b: s3 ? String(s3.b ?? "") : "",
    });
    setEditPartida(p);
  }

  function updatePlacarField<K extends keyof PlacarForm>(key: K, value: string) {
    setFormPlacar((prev) => ({ ...prev, [key]: value }));
  }

  function toNum(value: string) {
    const v = value.trim();
    if (!v) return null;
    if (!/^-?\d+$/.test(v)) return NaN;
    return Number(v);
  }

  async function salvarPlacarModal() {
    if (!editPartida) return;
    try {
      setErroPlacar(null);
      setSalvandoPlacar(true);

      const detalhes: Array<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }> = [];

      const s1a = toNum(formPlacar.s1a);
      const s1b = toNum(formPlacar.s1b);
      if (s1a === null || s1b === null) throw new Error("Informe o placar do set 1");
      if (Number.isNaN(s1a) || Number.isNaN(s1b)) throw new Error("Placar inválido no set 1");
      const tb1a = toNum(formPlacar.tb1a);
      const tb1b = toNum(formPlacar.tb1b);
      if (tb1a !== null || tb1b !== null) {
        if (tb1a === null || tb1b === null) throw new Error("Informe o tie-break completo do set 1");
        if (Number.isNaN(tb1a) || Number.isNaN(tb1b)) throw new Error("Tie-break inválido no set 1");
        detalhes.push({ set: 1, a: s1a, b: s1b, tiebreak: true, tbA: tb1a, tbB: tb1b });
      } else {
        detalhes.push({ set: 1, a: s1a, b: s1b });
      }

      const s2a = toNum(formPlacar.s2a);
      const s2b = toNum(formPlacar.s2b);
      if (s2a !== null || s2b !== null) {
        if (s2a === null || s2b === null) throw new Error("Informe o placar completo do set 2");
        if (Number.isNaN(s2a) || Number.isNaN(s2b)) throw new Error("Placar inválido no set 2");
        const tb2a = toNum(formPlacar.tb2a);
        const tb2b = toNum(formPlacar.tb2b);
        if (tb2a !== null || tb2b !== null) {
          if (tb2a === null || tb2b === null) throw new Error("Informe o tie-break completo do set 2");
          if (Number.isNaN(tb2a) || Number.isNaN(tb2b)) throw new Error("Tie-break inválido no set 2");
          detalhes.push({ set: 2, a: s2a, b: s2b, tiebreak: true, tbA: tb2a, tbB: tb2b });
        } else {
          detalhes.push({ set: 2, a: s2a, b: s2b });
        }
      }

      const s3a = toNum(formPlacar.s3a);
      const s3b = toNum(formPlacar.s3b);
      if (s3a !== null || s3b !== null) {
        if (s3a === null || s3b === null) throw new Error("Informe o placar completo do set 3");
        if (Number.isNaN(s3a) || Number.isNaN(s3b)) throw new Error("Placar inválido no set 3");
        detalhes.push({ set: 3, a: s3a, b: s3b });
      }

      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${editPartida.categoriaId}/partidas/${editPartida.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalhesPlacar: detalhes }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar placar");

      if ((editPartida.fase || "").toUpperCase() === "GRUPOS") {
        await fetch(`/api/v1/torneios/${slug}/categorias/${editPartida.categoriaId}/recalcular-classificacao`, { method: "POST" }).catch(() => null);
      }

      const dataRef = (dataSelecionada || "").trim() || ymdSaoPaulo();
      await carregarDados(dataRef);
      setEditPartida(null);
    } catch (e: any) {
      setErroPlacar(e?.message || "Erro inesperado");
    } finally {
      setSalvandoPlacar(false);
    }
  }

  async function gerarCardPartida(p: Partida) {
    try {
      setErro(null);
      if ((p.fotoUrl || "").trim()) {
        window.open(p.fotoUrl as string, "_blank");
        return;
      }
      await gerarCardPartidaAdmin({
        torneioNome: torneio?.nome || "Torneio",
        categoriaNome: p.categoriaNome || "Categoria",
        templateUrl: torneio?.templateUrl,
        syncFotosUrl: `/api/public/torneios/${slug}/categorias/${p.categoriaId}/partidas/${p.id}/sincronizar-fotos`,
        salvarNoGcs: true,
        uploadFolder: `cards/partidas/${slug}`,
        persistFotoUrlApi: `/api/v1/torneios/${slug}/categorias/${p.categoriaId}/partidas/${p.id}`,
        partida: {
          id: p.id,
          fase: p.fase,
          placarA: p.placarA ?? 0,
          placarB: p.placarB ?? 0,
          detalhesPlacar: p.detalhesPlacar ?? null,
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

  async function atualizarPlacares() {
    const dataRef = (dataSelecionada || "").trim() || ymdSaoPaulo();
    try {
      setErro(null);
      setAtualizandoPlacares(true);
      await carregarDados(dataRef);
    } catch (e: any) {
      setErro(e?.message || "Erro ao atualizar placares");
    } finally {
      setAtualizandoPlacares(false);
    }
  }

  async function sincronizarFotos() {
    try {
      setErro(null);
      if (partidas.length === 0) return;

      setSincronizandoFotos(true);
      const dataRef = (dataSelecionada || "").trim() || ymdSaoPaulo();

      const res = await fetch(`/api/v1/torneios/${slug}/jogos-do-dia?data=${dataRef}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        throw new Error(payload?.error || "Falha ao atualizar fotos");
      }

      let atualizados = 0;
      let consultados = 0;
      let jaAtualizados = 0;
      let semFotoNoPlay = 0;
      let falhasConsulta = 0;
      const totalAtletas = Number(payload?.totalAtletas ?? 0);
      const totalComPlayId = Number(payload?.totalComPlayId ?? 0);
      atualizados += Number(payload?.atualizados ?? 0);
      consultados += Number(payload?.consultados ?? 0);
      jaAtualizados += Number(payload?.jaAtualizados ?? 0);
      semFotoNoPlay += Number(payload?.semFotoNoPlay ?? 0);
      falhasConsulta += Number(payload?.falhasConsulta ?? 0);

      await carregarDados(dataRef);

      alert(
        `Sincronização concluída.\n\nAtletas (jogos listados): ${totalAtletas}\nCom Play ID: ${totalComPlayId}\nConsultados: ${consultados}\nAtualizados: ${atualizados}\nJá atualizados: ${jaAtualizados}\nSem foto no Play: ${semFotoNoPlay}\nFalhas: ${falhasConsulta}`
      );
    } catch (e: any) {
      setErro(e?.message || "Erro ao sincronizar fotos");
    } finally {
      setSincronizandoFotos(false);
    }
  }

  async function atualizarFotoAtleta(usuarioId: string) {
    const id = (usuarioId || "").trim();
    if (!id) return;
    if (atletasAtualizando[id]) return;

    try {
      setErro(null);
      setAtletasAtualizando((prev) => ({ ...prev, [id]: true }));
      const dataRef = (dataSelecionada || "").trim() || ymdSaoPaulo();
      const res = await fetch(`/api/v1/torneios/${slug}/jogos-do-dia?data=${dataRef}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: id }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao atualizar foto");
      await carregarDados(dataRef);
    } catch (e: any) {
      setErro(e?.message || "Erro ao atualizar foto");
    } finally {
      setAtletasAtualizando((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function gerarRelatorioHTML() {
    if (!torneio || partidas.length === 0) return;
    
    try {
      setGerandoRelatorio(true);

      const escapeHtml = (value: string) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const formatHoraRelatorio = (value?: string | null) => {
        if (!value) return "--:--";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "--:--";
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      };

      const bannerHtml = torneio.bannerUrl
        ? `<div class="mb-8 w-full"><img src="/api/image-proxy?url=${encodeURIComponent(torneio.bannerUrl)}" class="w-full h-auto rounded-xl shadow-sm" crossOrigin="anonymous" /></div>`
        : "";

      const cardsHtml = partidas
        .map((p) => {
          const equipeAAtletas = p.equipeAAtletas ?? [];
          const equipeBAtletas = p.equipeBAtletas ?? [];

          const atletasAHtml = equipeAAtletas
            .map((a) => {
              const src = fotoSrc(a.fotoUrl);
              return `<img src="${src}" class="h-14 w-14 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm" onerror="this.src='${avatarPlaceholder}'" crossOrigin="anonymous" />`;
            })
            .join("");

          const atletasBHtml = equipeBAtletas
            .map((a) => {
              const src = fotoSrc(a.fotoUrl);
              return `<img src="${src}" class="h-14 w-14 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm" onerror="this.src='${avatarPlaceholder}'" crossOrigin="anonymous" />`;
            })
            .join("");

          const categoriaNome = escapeHtml(p.categoriaNome || "Categoria");
          const fase = escapeHtml(p.fase || "");
          const equipeANome = escapeHtml(p.equipeANome || "A definir");
          const equipeBNome = escapeHtml(p.equipeBNome || "A definir");
          const arenaNome = escapeHtml(p.arenaNome || "A definir");
          const quadra = p.quadra ? escapeHtml(String(p.quadra)) : "";
          const hora = formatHoraRelatorio(p.dataHorario);

          return `
            <div class="card-partida bg-white">
              <div class="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                <span class="font-bold text-slate-700 uppercase tracking-wider text-xs">${categoriaNome}</span>
                <span class="text-xs font-medium text-slate-500">${fase}</span>
              </div>
              <div class="p-6">
                <div class="flex items-center justify-between gap-8">
                  <div class="flex-1 flex flex-col items-center text-center">
                    <div class="flex -space-x-2 mb-3">${atletasAHtml}</div>
                    <span class="font-bold text-slate-900 leading-tight">${equipeANome}</span>
                  </div>
                  <div class="flex flex-col items-center px-4"><span class="text-2xl font-black text-slate-300">VS</span></div>
                  <div class="flex-1 flex flex-col items-center text-center">
                    <div class="flex -space-x-2 mb-3">${atletasBHtml}</div>
                    <span class="font-bold text-slate-900 leading-tight">${equipeBNome}</span>
                  </div>
                </div>
              </div>
              <div class="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-between items-center text-sm">
                <div class="flex items-center gap-2 text-slate-700 font-bold">${hora}</div>
                <div class="flex items-center gap-2 text-slate-700 font-medium">${arenaNome}${quadra ? ` - ${quadra}` : ""}</div>
              </div>
            </div>
          `;
        })
        .join("");

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Jogos do Dia - ${torneio.nome}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
          <style>
            @media print { .no-print { display: none; } body { padding: 0; margin: 0; } }
            body { background-color: white; font-family: sans-serif; }
            .card-partida { break-inside: avoid; border: 1px solid #e2e8f0; margin-bottom: 1rem; border-radius: 0.75rem; overflow: hidden; }
            #capture-target { padding: 2rem; background: white; }
          </style>
          <script>
            async function gerarImagem() {
              const btn = document.getElementById('btn-gerar-imagem');
              const originalText = btn.innerText;
              try {
                btn.innerText = 'Processando...';
                btn.disabled = true;
                await new Promise(r => setTimeout(r, 500));
                const element = document.getElementById('capture-target');
                const canvas = await html2canvas(element, { useCORS: true, scale: 2, backgroundColor: '#ffffff', logging: false });
                const link = document.createElement('a');
                link.download = \`jogos-do-dia-\${new Date().toISOString().split('T')[0]}.png\`;
                link.href = canvas.toDataURL('image/png');
                link.click();
              } catch (err) { alert('Erro ao gerar imagem.'); } finally { btn.innerText = originalText; btn.disabled = false; }
            }
          </script>
        </head>
        <body class="p-4 md:p-8 bg-slate-100">
          <div class="max-w-4xl mx-auto">
            <div class="no-print flex justify-end gap-3 mb-6">
              <button id="btn-gerar-imagem" onclick="gerarImagem()" class="bg-orange-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-600">Gerar Imagem (PNG)</button>
              <button onclick="window.print()" class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium">Imprimir Relatório</button>
            </div>
            <div id="capture-target" class="shadow-xl rounded-2xl">
              ${bannerHtml}
              <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-slate-900">${torneio.nome}</h1>
                <p class="text-lg text-slate-600">Jogos do Dia - ${datePtBrFromYmd(dataSelecionada)}</p>
              </div>
              <div class="grid grid-cols-1 gap-6">
                ${cardsHtml}
              </div>
              <footer class="mt-12 pt-8 border-t border-slate-100 text-center text-slate-400 text-xs">Gerado por Play Na Quadra</footer>
            </div>
          </div>
        </body>
        </html>
      `;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(htmlContent);
        win.document.close();
      }
    } catch (e: any) {
      alert("Erro ao gerar relatório: " + e.message);
    } finally {
      setGerandoRelatorio(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Jogos do Dia</h1>
          <p className="text-sm text-slate-600">
            {torneio?.nome} • {datePtBrFromYmd(dataSelecionada)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            <Calendar className="h-4 w-4 text-slate-500" />
            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="bg-transparent outline-none text-slate-700"
            />
          </div>
          <button
            onClick={sincronizarFotos}
            disabled={sincronizandoFotos || partidas.length === 0 || carregando}
            className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            {sincronizandoFotos ? "Atualizando fotos..." : "Atualizar fotos"}
          </button>
          <button
            onClick={atualizarPlacares}
            disabled={atualizandoPlacares || carregando}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${atualizandoPlacares ? 'animate-spin' : ''}`} />
            {atualizandoPlacares ? "Atualizando placares..." : "Atualizar placar"}
          </button>
          <button
            onClick={gerarRelatorioHTML}
            disabled={gerandoRelatorio || partidas.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            {gerandoRelatorio ? "Gerando..." : "Gerar Relatório"}
          </button>
          <button
            onClick={() => carregarDados(dataSelecionada)}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-slate-50 animate-pulse border border-slate-100" />
          ))
        ) : partidas.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhum jogo agendado para esta data.</p>
          </div>
        ) : (
          partidas.map((p) => (
            <div key={p.id} className="group relative flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-md">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col gap-1">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-slate-600 w-fit">
                      {p.categoriaNome}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      {p.arenaNome ? (
                        <span className="flex items-center gap-1">
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
                  </div>
                  {getStatusBadge(p.status)}
                </div>

                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex-1 text-center">
                    <div className="flex items-center justify-center -space-x-2 mb-2">
                      {(p.equipeAAtletas ?? []).slice(0, 2).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => atualizarFotoAtleta(a.id)}
                          disabled={Boolean(atletasAtualizando[a.id])}
                          title="Atualizar foto do Play Na Quadra"
                          className="relative h-9 w-9 rounded-full border-2 border-white bg-slate-100 shadow-sm disabled:opacity-60"
                        >
                          <img
                            src={fotoSrc(a.fotoUrl)}
                            onError={(e) => {
                              const el = e.currentTarget as HTMLImageElement;
                              el.src = avatarPlaceholder;
                            }}
                            className="h-full w-full rounded-full object-cover"
                            alt={a.nome}
                          />
                          {atletasAtualizando[a.id] && (
                            <span className="absolute inset-0 rounded-full bg-white/70 flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="font-bold text-slate-900 leading-tight mb-1">
                      {p.equipeANome || "A definir"}
                    </div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">
                      {p.equipeAAtletas?.map(a => a.nome).join(' / ')}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center justify-center min-w-[2.5rem]">
                    {textoPlacar(p) ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-center">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Placar</span>
                        <span className="block text-xs font-bold text-emerald-800">{textoPlacar(p)}</span>
                      </div>
                    ) : (
                      <span className="text-sm font-black text-slate-300 italic">VS</span>
                    )}
                  </div>

                  <div className="flex-1 text-center">
                    <div className="flex items-center justify-center -space-x-2 mb-2">
                      {(p.equipeBAtletas ?? []).slice(0, 2).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => atualizarFotoAtleta(a.id)}
                          disabled={Boolean(atletasAtualizando[a.id])}
                          title="Atualizar foto do Play Na Quadra"
                          className="relative h-9 w-9 rounded-full border-2 border-white bg-slate-100 shadow-sm disabled:opacity-60"
                        >
                          <img
                            src={fotoSrc(a.fotoUrl)}
                            onError={(e) => {
                              const el = e.currentTarget as HTMLImageElement;
                              el.src = avatarPlaceholder;
                            }}
                            className="h-full w-full rounded-full object-cover"
                            alt={a.nome}
                          />
                          {atletasAtualizando[a.id] && (
                            <span className="absolute inset-0 rounded-full bg-white/70 flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="font-bold text-slate-900 leading-tight mb-1">
                      {p.equipeBNome || "A definir"}
                    </div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">
                      {p.equipeBAtletas?.map(a => a.nome).join(' / ')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-auto">
                <div className="text-xs font-bold text-slate-700">
                  {formatDataHora(p.dataHorario) || "Horário a definir"}
                </div>
                
                <div className="flex items-center gap-2">
                  {p.status !== "CANCELADA" && (
                    <button
                      type="button"
                      onClick={() => abrirModalPlacar(p)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {textoPlacar(p) ? "Editar placar" : "Informar placar"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => gerarCardPartida(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Gerar Card
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editPartida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditPartida(null)}>
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <div className="text-sm font-black text-slate-900">Informar placar</div>
                <div className="text-xs text-slate-600">
                  {editPartida.categoriaNome} • {editPartida.equipeANome || "A definir"} vs {editPartida.equipeBNome || "A definir"}
                </div>
              </div>
              <button type="button" onClick={() => setEditPartida(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {erroPlacar && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroPlacar}</div>}

              <div className="grid grid-cols-5 gap-2 items-center">
                <div className="col-span-1 text-xs font-bold text-slate-600">Set</div>
                <div className="col-span-2 text-xs font-bold text-slate-600 text-center">{editPartida.equipeANome || "Equipe A"}</div>
                <div className="col-span-2 text-xs font-bold text-slate-600 text-center">{editPartida.equipeBNome || "Equipe B"}</div>

                <div className="col-span-1 text-xs font-bold text-slate-700">1</div>
                <input value={formPlacar.s1a} onChange={(e) => updatePlacarField("s1a", e.target.value)} inputMode="numeric" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
                <input value={formPlacar.tb1a} onChange={(e) => updatePlacarField("tb1a", e.target.value)} inputMode="numeric" placeholder="TB" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
                <input value={formPlacar.s1b} onChange={(e) => updatePlacarField("s1b", e.target.value)} inputMode="numeric" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
                <input value={formPlacar.tb1b} onChange={(e) => updatePlacarField("tb1b", e.target.value)} inputMode="numeric" placeholder="TB" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />

                <div className="col-span-1 text-xs font-bold text-slate-700">2</div>
                <input value={formPlacar.s2a} onChange={(e) => updatePlacarField("s2a", e.target.value)} inputMode="numeric" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
                <input value={formPlacar.tb2a} onChange={(e) => updatePlacarField("tb2a", e.target.value)} inputMode="numeric" placeholder="TB" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
                <input value={formPlacar.s2b} onChange={(e) => updatePlacarField("s2b", e.target.value)} inputMode="numeric" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
                <input value={formPlacar.tb2b} onChange={(e) => updatePlacarField("tb2b", e.target.value)} inputMode="numeric" placeholder="TB" className="col-span-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />

                <div className="col-span-1 text-xs font-bold text-slate-700">3</div>
                <input value={formPlacar.s3a} onChange={(e) => updatePlacarField("s3a", e.target.value)} inputMode="numeric" className="col-span-2 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
                <input value={formPlacar.s3b} onChange={(e) => updatePlacarField("s3b", e.target.value)} inputMode="numeric" className="col-span-2 rounded-md border border-slate-200 px-2 py-1 text-sm text-center" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
              <button type="button" onClick={() => setEditPartida(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void salvarPlacarModal()}
                disabled={salvandoPlacar}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {salvandoPlacar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar placar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
