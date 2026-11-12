"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Download, Printer, RefreshCw, Search, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Button, Card, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";

/** Entrega de camisetas: atletas com inscricao paga, agrupados por tipo de camiseta, com marcacao de entrega e PDF. */

type AtletaApi = {
  atletaId: string;
  atletaNome: string;
  atletaCamiseta: string | null;
  camisetaEntregueEm?: string | null;
  pago: boolean;
};

type ApiResponse = {
  torneio: { id: string; nome: string; slug: string; camisetaOpcoes?: string[] };
  categorias: { categoriaId: string; categoriaNome: string; atletas: AtletaApi[] }[];
};

type LinhaEntrega = {
  atletaId: string;
  nome: string;
  tipo: string;
  tamanho: string;
  categorias: string[];
  entregueEm: string | null;
};

type Filtro = "TODOS" | "A_ENTREGAR" | "ENTREGUES";

const SEM_CAMISETA = "Sem camiseta informada";
const TAMANHOS = new Set(["PP", "P", "M", "G", "GG", "XG", "XGG", "EG", "EXG", "EXGG", "UNICO", "UNICA", "U"]);

function normalizar(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

/** "Baby Look M" -> tipo "Baby Look", tamanho "M"; so o tamanho ("M") vira tipo "Camiseta". */
function separarCamiseta(valor: string): { tipo: string; tamanho: string } {
  const texto = normalizar(valor);
  if (!texto) return { tipo: SEM_CAMISETA, tamanho: "-" };
  const partes = texto.split(" ");
  const ultimo = partes[partes.length - 1].toUpperCase();
  if (partes.length === 1) return TAMANHOS.has(ultimo) ? { tipo: "Camiseta", tamanho: ultimo } : { tipo: texto, tamanho: "-" };
  if (TAMANHOS.has(ultimo)) return { tipo: partes.slice(0, -1).join(" "), tamanho: ultimo === "U" ? "UNICO" : ultimo };
  return { tipo: texto, tamanho: "-" };
}

function formatarEntrega(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function EntregaCamisetasPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Record<string, string | null>>({});
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [busca, setBusca] = useState("");

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/atletas-inscritos`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar inscritos");
      setData(payload as ApiResponse);
      const mapa: Record<string, string | null> = {};
      for (const c of (payload as ApiResponse).categorias) for (const a of c.atletas) mapa[a.atletaId] = a.camisetaEntregueEm ?? null;
      setEntregas(mapa);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar inscritos");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [slug]);

  // atleta pago aparece uma vez so, mesmo inscrito em mais de uma categoria (uma camiseta por torneio)
  const linhas = useMemo<LinhaEntrega[]>(() => {
    if (!data) return [];
    const opcoes = (data.torneio.camisetaOpcoes ?? []).map(normalizar);
    const porAtleta = new Map<string, LinhaEntrega>();
    for (const c of data.categorias) {
      for (const a of c.atletas) {
        if (!a.pago) continue;
        const existente = porAtleta.get(a.atletaId);
        if (existente) {
          if (!existente.categorias.includes(c.categoriaNome)) existente.categorias.push(c.categoriaNome);
          continue;
        }
        const bruto = normalizar(a.atletaCamiseta);
        const opcao = opcoes.find((o) => o.toLowerCase() === bruto.toLowerCase()) ?? bruto;
        porAtleta.set(a.atletaId, {
          atletaId: a.atletaId,
          nome: normalizar(a.atletaNome) || "Atleta",
          ...separarCamiseta(opcao),
          categorias: [c.categoriaNome],
          entregueEm: null,
        });
      }
    }
    return Array.from(porAtleta.values()).map((l) => ({ ...l, entregueEm: entregas[l.atletaId] ?? null }));
  }, [data, entregas]);

  const grupos = useMemo(() => {
    const termo = normalizar(busca).toLowerCase();
    const visiveis = linhas.filter((l) => {
      if (filtro === "A_ENTREGAR" && l.entregueEm) return false;
      if (filtro === "ENTREGUES" && !l.entregueEm) return false;
      return !termo || l.nome.toLowerCase().includes(termo);
    });
    return agruparPorTipo(visiveis);
  }, [linhas, filtro, busca]);

  const total = linhas.length;
  const entregues = linhas.filter((l) => l.entregueEm).length;

  async function alternarEntrega(linha: LinhaEntrega) {
    const entregue = !linha.entregueEm;
    const anterior = linha.entregueEm;
    setSalvando((s) => ({ ...s, [linha.atletaId]: true }));
    setEntregas((m) => ({ ...m, [linha.atletaId]: entregue ? new Date().toISOString() : null }));
    try {
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/atletas-inscritos/${linha.atletaId}/camiseta-entrega`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregue }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar a entrega");
      setEntregas((m) => ({ ...m, [linha.atletaId]: payload?.camisetaEntregueEm ?? null }));
    } catch (e: any) {
      setEntregas((m) => ({ ...m, [linha.atletaId]: anterior }));
      setErro(`${linha.nome}: ${e?.message || "não foi possível salvar a entrega"}`);
    } finally {
      setSalvando((s) => ({ ...s, [linha.atletaId]: false }));
    }
  }

  async function gerarPdf(modo: "baixar" | "imprimir") {
    if (!data || linhas.length === 0) return;
    const { jsPDF } = await import("jspdf");
    const doc = montarPdf(jsPDF, data.torneio.nome, agruparPorTipo(linhas), { total, entregues });
    const nomeArquivo = `entrega-camisetas-${data.torneio.slug || "torneio"}.pdf`;

    if (modo === "imprimir") {
      doc.autoPrint();
      const url = URL.createObjectURL(doc.output("blob"));
      const janela = window.open(url, "_blank");
      if (!janela) alert("Libere as janelas pop-up deste site para imprimir.");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

    const blob = doc.output("blob");
    const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });
    // compartilhar so no celular; no computador baixa
    const celular = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (celular && navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: `Entrega de camisetas - ${data.torneio.nome}` });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const filtros: { id: Filtro; label: string; n: number }[] = [
    { id: "TODOS", label: "Todos", n: total },
    { id: "A_ENTREGAR", label: "A entregar", n: total - entregues },
    { id: "ENTREGUES", label: "Entregues", n: entregues },
  ];

  return (
    <div className="space-y-5">
      <LinkButton href={`/admin/torneios/${slug}/atletas-inscritos`} variant="ghost" size="sm" icon={<ArrowLeft />}>
        Atletas e inscrições
      </LinkButton>

      <PageHeader
        eyebrow={data?.torneio?.nome}
        title="Entrega de camisetas"
        description="Atletas com a inscrição paga, por tipo de camiseta. Toque em Entregar quando o atleta retirar a camiseta."
        actions={
          <>
            <Button icon={<RefreshCw className={carregando ? "animate-spin" : ""} />} onClick={() => void carregar()} disabled={carregando}>
              Atualizar
            </Button>
            <Button icon={<Download />} onClick={() => void gerarPdf("baixar")} disabled={!data || total === 0}>
              Baixar PDF
            </Button>
            <Button variant="primary" icon={<Printer />} onClick={() => void gerarPdf("imprimir")} disabled={!data || total === 0}>
              Imprimir
            </Button>
          </>
        }
      />

      {erro && <Alert>{erro}</Alert>}

      <Card className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-bold text-ink">
            {entregues} de {total} entregue{total === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-muted">{total - entregues} a entregar</div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sand-2">
          <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${total ? Math.round((entregues / total) * 100) : 0}%` }} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1 rounded-xl bg-sand-2 p-1">
            {filtros.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold sm:flex-none",
                  filtro === f.id ? "bg-white text-ink shadow-sm" : "text-ink-2"
                )}
              >
                {f.label} {f.n}
              </button>
            ))}
          </div>
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar atleta"
              className="h-10 w-full rounded-[10px] border border-line bg-white pl-9 pr-3 text-sm text-ink focus:border-ink-2 focus:outline-none"
            />
          </label>
        </div>
      </Card>

      {carregando && !data ? (
        <Card className="p-8 text-center text-sm text-muted">Carregando…</Card>
      ) : total === 0 ? (
        <Card>
          <EmptyState icon={<Shirt />} title="Nenhum atleta com inscrição paga" description="Quando os pagamentos forem confirmados, os atletas aparecem aqui." />
        </Card>
      ) : grupos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Nenhum atleta neste filtro.</Card>
      ) : (
        grupos.map((g) => (
          <Card key={g.tipo} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-sand px-4 py-3">
              <div className="font-display text-xl font-bold text-ink">{g.tipo}</div>
              <div className="text-xs font-semibold text-muted">
                {g.linhas.filter((l) => l.entregueEm).length}/{g.linhas.length} entregues
              </div>
            </div>
            <ul className="divide-y divide-line">
              {g.linhas.map((l) => (
                <li key={l.atletaId} className={cn("flex items-center gap-3 px-4 py-3", l.entregueEm && "bg-[#f3faf6]")}>
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-white font-display text-lg font-bold text-ink">
                    {l.tamanho}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm font-bold", l.entregueEm ? "text-ink-2" : "text-ink")}>{l.nome}</div>
                    <div className="truncate text-xs text-muted">
                      {l.entregueEm ? `Entregue ${formatarEntrega(l.entregueEm)}` : l.categorias.join(" · ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void alternarEntrega(l)}
                    disabled={Boolean(salvando[l.atletaId])}
                    aria-pressed={Boolean(l.entregueEm)}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-bold transition-colors disabled:opacity-60",
                      l.entregueEm ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" : "border-[#d9d5cc] bg-white text-ink hover:bg-sand"
                    )}
                  >
                    {l.entregueEm && <Check className="h-4 w-4" />}
                    {l.entregueEm ? "Entregue" : "Entregar"}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

function agruparPorTipo(linhas: LinhaEntrega[]) {
  const mapa = new Map<string, LinhaEntrega[]>();
  for (const l of linhas) {
    const lista = mapa.get(l.tipo) ?? [];
    lista.push(l);
    mapa.set(l.tipo, lista);
  }
  return Array.from(mapa.entries())
    .sort(([a], [b]) => (a === SEM_CAMISETA ? 1 : b === SEM_CAMISETA ? -1 : a.localeCompare(b, "pt-BR")))
    .map(([tipo, lista]) => ({ tipo, linhas: lista.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }));
}

/** PDF A4 para imprimir e marcar a caneta: por tipo, nome, tamanho e a caixa de entregue. */
function montarPdf(
  JsPDF: typeof import("jspdf").jsPDF,
  torneioNome: string,
  grupos: { tipo: string; linhas: LinhaEntrega[] }[],
  resumo: { total: number; entregues: number }
) {
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const margem = 14;
  const largura = 210 - margem * 2;
  const colNum = 10;
  const colTam = 24;
  const colEnt = 42;
  const colNome = largura - colNum - colTam - colEnt;
  const altura = 8;
  let y = margem;

  const quebra = (h: number) => {
    if (y + h > 297 - margem) {
      doc.addPage();
      y = margem;
      return true;
    }
    return false;
  };
  const cabecalhoTabela = () => {
    doc.setFillColor(243, 241, 236);
    doc.rect(margem, y, largura, altura, "F");
    linhaTabela(["#", "Atleta", "Tamanho", "Entregue"], true);
  };
  const linhaTabela = (cels: [string, string, string, string], negrito = false, entregue = false) => {
    doc.setDrawColor(217, 213, 204);
    let x = margem;
    for (const w of [colNum, colNome, colTam, colEnt]) {
      doc.rect(x, y, w, altura);
      x += w;
    }
    const base = y + altura / 2 + 1.3;
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(negrito ? 23 : 107, negrito ? 24 : 107, negrito ? 28 : 107);
    doc.text(cels[0], margem + colNum / 2, base, { align: "center" });
    doc.setTextColor(23, 24, 28);
    const nome = doc.splitTextToSize(cels[1], colNome - 5)[0] ?? "";
    doc.text(nome, margem + colNum + 2.5, base);
    doc.text(cels[2], margem + colNum + colNome + colTam / 2, base, { align: "center" });
    const xEnt = margem + colNum + colNome + colTam;
    if (negrito) {
      doc.text(cels[3], xEnt + colEnt / 2, base, { align: "center" });
    } else {
      // caixinha para marcar a caneta; ja entregue sai marcada com a data
      doc.rect(xEnt + 3, y + 2, 4, 4);
      if (entregue) {
        doc.setLineWidth(0.5);
        doc.line(xEnt + 3.7, y + 4.1, xEnt + 4.8, y + 5.3);
        doc.line(xEnt + 4.8, y + 5.3, xEnt + 6.6, y + 2.6);
        doc.setLineWidth(0.2);
        doc.setFontSize(8);
        doc.text(cels[3], xEnt + 9, base);
      }
    }
    y += altura;
  };

  const emitido = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  doc.setTextColor(23, 24, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Entrega de camisetas", margem, y + 5);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 107, 107);
  doc.text(`${torneioNome} · inscrições pagas · emitido em ${emitido}`, margem, y);
  y += 5;
  doc.text(`${resumo.total} atleta(s) · ${resumo.entregues} já entregue(s)`, margem, y);
  doc.setTextColor(23, 24, 28);
  y += 4;

  for (const g of grupos) {
    quebra(12 + altura * 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`${g.tipo} (${g.linhas.length})`, margem, y + 6);
    y += 9;
    cabecalhoTabela();
    g.linhas.forEach((l, i) => {
      if (quebra(altura)) cabecalhoTabela();
      linhaTabela([String(i + 1), l.nome, l.tamanho, formatarEntrega(l.entregueEm)], false, Boolean(l.entregueEm));
    });
    y += 3;
  }
  return doc;
}
