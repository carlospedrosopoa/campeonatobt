"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  Copy,
  DollarSign,
  ExternalLink,
  FileUp,
  Gamepad2,
  ImageIcon,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Settings2,
  Smartphone,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { gerarCardProgramacaoTorneioAdmin } from "@/lib/match-card-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  GENERO_LABEL,
  LinkButton,
  Menu,
  PageHeader,
  StatCard,
  TorneioStatusBadge,
} from "@/components/admin/ui";
import { periodoTorneio } from "@/components/admin/torneio-destaque";

type Torneio = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  dataInicio: string;
  dataFim: string;
  local: string;
  status: "RASCUNHO" | "ABERTO" | "EM_ANDAMENTO" | "FINALIZADO" | "CANCELADO";
  bannerUrl: string | null;
  logoUrl: string | null;
  templateUrl: string | null;
  organizadorId: string;
  esporteId: string | null;
  esporteNome: string | null;
};

type Categoria = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
  dataHorario: string | null;
  tipoCardInscricao?: "TIPO_1" | "TIPO_2" | null;
  criadoEm: string | Date;
  inscricoesTotal: number;
  inscricoesPendentes: number;
  inscricoesAprovadas: number;
  inscricoesFilaEspera: number;
  inscricoesRecusadas: number;
};

type DashboardStats = {
  categoriasTotal: number;
  inscricoesTotal: number;
  inscricoesPendentes: number;
  inscricoesAprovadas: number;
  inscricoesFilaEspera: number;
  inscricoesRecusadas: number;
};

export default function AdminTorneioDashboardPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slugAtual = params.slug;

  const [torneio, setTorneio] = useState<Torneio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erroCategorias, setErroCategorias] = useState<string | null>(null);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [gerandoCardProgramacao, setGerandoCardProgramacao] = useState(false);
  const [editandoCategoriaId, setEditandoCategoriaId] = useState<string | null>(null);
  const [mostraFormCategoria, setMostraFormCategoria] = useState(false);
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);
  const [clonandoCategoriaId, setClonandoCategoriaId] = useState<string | null>(null);
  const [excluindoCategoriaId, setExcluindoCategoriaId] = useState<string | null>(null);
  const [clonandoTorneioId, setClonandoTorneioId] = useState<string | null>(null);
  const [categoriaParaClonar, setCategoriaParaClonar] = useState<Categoria | null>(null);
  const [categoriaParaExcluir, setCategoriaParaExcluir] = useState<Categoria | null>(null);
  const [torneioParaClonar, setTorneioParaClonar] = useState<Torneio | null>(null);
  const [nomeCloneCategoria, setNomeCloneCategoria] = useState("");
  const [manterInscricoesCloneCategoria, setManterInscricoesCloneCategoria] = useState(true);
  const [nomeCloneTorneio, setNomeCloneTorneio] = useState("");
  const [senhaExclusaoCategoria, setSenhaExclusaoCategoria] = useState("");
  const [formCategoria, setFormCategoria] = useState({
    nome: "",
    genero: "MISTO" as Categoria["genero"],
    valorInscricao: "",
    vagasMaximas: "",
    dataHorario: "",
    tipoCardInscricao: "TIPO_1" as "TIPO_1" | "TIPO_2",
  });

  function formatDataHora(value?: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    return `${data} ${hora}`;
  }

  function toLocalDateTimeInput(value: string | null | undefined) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function gerarCardProgramacaoTorneio() {
    if (!torneio) return;
    try {
      setErroCategorias(null);
      setGerandoCardProgramacao(true);
      const result = await gerarCardProgramacaoTorneioAdmin({
        torneioNome: torneio.nome,
        templateUrl: torneio.templateUrl ?? null,
        salvarNoGcs: true,
        uploadFolder: `campeonatos/cards/programacao-torneio/${slugAtual}`,
        categorias: categorias.map((c) => ({ id: c.id, nome: c.nome, genero: c.genero, dataHorario: c.dataHorario })),
      });
      const url = (result?.url || "").trim();
      if (url) window.open(url, "_blank");
    } catch (e: any) {
      setErroCategorias(e?.message || "Não foi possível gerar o card de programação");
    } finally {
      setGerandoCardProgramacao(false);
    }
  }

  useEffect(() => {
    let ativo = true;

    async function carregarDashboard() {
      try {
        setCarregando(true);
        setErro(null);
        const res = await fetch(`/api/v1/torneios/${slugAtual}/dashboard`, { cache: "no-store" });
        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Falha ao carregar dashboard");
        }
        const payload = (await res.json()) as { torneio: Torneio; stats: DashboardStats; categorias: Categoria[] };

        if (!ativo) return;

        setTorneio(payload.torneio);
        setStats(payload.stats);
        setCategorias(payload.categorias);
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro inesperado");
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregarDashboard();
    return () => {
      ativo = false;
    };
  }, [slugAtual]);

  const podeSalvarCategoria = useMemo(() => {
    return Boolean(formCategoria.nome.trim() && formCategoria.genero);
  }, [formCategoria]);

  function abrirNovaCategoria() {
    setMostraFormCategoria(true);
    setEditandoCategoriaId(null);
    setFormCategoria({ nome: "", genero: "MISTO", valorInscricao: "", vagasMaximas: "", dataHorario: "", tipoCardInscricao: "TIPO_1" });
    setErroCategorias(null);
  }

  function abrirEditarCategoria(cat: Categoria) {
    setMostraFormCategoria(true);
    setEditandoCategoriaId(cat.id);
    setFormCategoria({
      nome: cat.nome,
      genero: cat.genero,
      valorInscricao: cat.valorInscricao ?? "",
      vagasMaximas: cat.vagasMaximas === null ? "" : String(cat.vagasMaximas),
      dataHorario: toLocalDateTimeInput(cat.dataHorario),
      tipoCardInscricao: cat.tipoCardInscricao === "TIPO_2" ? "TIPO_2" : "TIPO_1",
    });
    setErroCategorias(null);
  }

  function cancelarCategoria() {
    setMostraFormCategoria(false);
    setEditandoCategoriaId(null);
    setFormCategoria({ nome: "", genero: "MISTO", valorInscricao: "", vagasMaximas: "", dataHorario: "", tipoCardInscricao: "TIPO_1" });
    setErroCategorias(null);
  }

  function abrirClonarCategoria(cat: Categoria) {
    setCategoriaParaClonar(cat);
    setNomeCloneCategoria(`${cat.nome} - Cópia`);
    setManterInscricoesCloneCategoria(true);
    setErroCategorias(null);
  }

  function abrirClonarTorneio() {
    if (!torneio) return;
    setTorneioParaClonar(torneio);
    setNomeCloneTorneio(`${torneio.nome} - Cópia`);
    setErroCategorias(null);
  }

  function fecharModalClonarCategoria() {
    if (clonandoCategoriaId) return;
    setCategoriaParaClonar(null);
    setNomeCloneCategoria("");
    setManterInscricoesCloneCategoria(true);
  }

  function fecharModalClonarTorneio() {
    if (clonandoTorneioId) return;
    setTorneioParaClonar(null);
    setNomeCloneTorneio("");
  }

  async function recarregarDashboard() {
    const res = await fetch(`/api/v1/torneios/${slugAtual}/dashboard`, { cache: "no-store" });
    if (!res.ok) return;
    const payload = (await res.json()) as { torneio: Torneio; stats: DashboardStats; categorias: Categoria[] };
    setTorneio(payload.torneio);
    setStats(payload.stats);
    setCategorias(payload.categorias);
  }

  async function onSalvarCategoria(e: React.FormEvent) {
    e.preventDefault();
    setErroCategorias(null);

    if (!podeSalvarCategoria) {
      setErroCategorias("Preencha os campos obrigatórios da categoria.");
      return;
    }

    try {
      setSalvandoCategoria(true);
      const payload: any = {
        nome: formCategoria.nome.trim(),
        genero: formCategoria.genero,
      };

      if (formCategoria.valorInscricao.trim()) payload.valorInscricao = Number(formCategoria.valorInscricao);
      if (formCategoria.vagasMaximas.trim()) payload.vagasMaximas = Number(formCategoria.vagasMaximas);
      payload.dataHorario = formCategoria.dataHorario.trim() ? new Date(formCategoria.dataHorario).toISOString() : null;
      payload.tipoCardInscricao = formCategoria.tipoCardInscricao;

      const url = editandoCategoriaId
        ? `/api/v1/torneios/${slugAtual}/categorias/${editandoCategoriaId}`
        : `/api/v1/torneios/${slugAtual}/categorias`;

      const method = editandoCategoriaId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao salvar categoria");
      }

      await recarregarDashboard();
      cancelarCategoria();
    } catch (e: any) {
      setErroCategorias(e?.message || "Erro inesperado");
    } finally {
      setSalvandoCategoria(false);
    }
  }

  async function onExcluirCategoria(categoriaId: string) {
    const categoria = categorias.find((item) => item.id === categoriaId) ?? null;
    setCategoriaParaExcluir(categoria);
    setSenhaExclusaoCategoria("");
    setErroCategorias(null);
  }

  async function confirmarClonagemCategoria() {
    if (!categoriaParaClonar) return;
    setErroCategorias(null);

    const nome = nomeCloneCategoria.trim();
    if (!nome) {
      setErroCategorias("Informe o nome da nova categoria.");
      return;
    }

    try {
      setClonandoCategoriaId(categoriaParaClonar.id);
      const res = await fetch(`/api/v1/torneios/${slugAtual}/categorias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          categoriaOrigemId: categoriaParaClonar.id,
          manterInscricoes: manterInscricoesCloneCategoria,
        }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao clonar categoria");
      }

      await recarregarDashboard();
      setCategoriaParaClonar(null);
      setNomeCloneCategoria("");
      setManterInscricoesCloneCategoria(true);
    } catch (e: any) {
      setErroCategorias(e?.message || "Erro inesperado");
    } finally {
      setClonandoCategoriaId(null);
    }
  }

  async function confirmarClonagemTorneio() {
    if (!torneioParaClonar) return;
    setErroCategorias(null);

    const nome = nomeCloneTorneio.trim();
    if (!nome) {
      setErroCategorias("Informe o nome do novo torneio.");
      return;
    }

    try {
      setClonandoTorneioId(torneioParaClonar.id);
      const res = await fetch(`/api/v1/torneios/${slugAtual}/clonar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao clonar torneio");
      }

      const novo = (await res.json().catch(() => null)) as { slug?: string | null };
      if (novo?.slug) {
        router.push(`/admin/torneios/${novo.slug}`);
        return;
      }

      await recarregarDashboard();
      fecharModalClonarTorneio();
    } catch (e: any) {
      setErroCategorias(e?.message || "Erro inesperado");
    } finally {
      setClonandoTorneioId(null);
    }
  }

  function fecharModalExcluirCategoria() {
    if (excluindoCategoriaId) return;
    setCategoriaParaExcluir(null);
    setSenhaExclusaoCategoria("");
  }

  async function confirmarExclusaoCategoria() {
    if (!categoriaParaExcluir) return;
    setErroCategorias(null);

    if (!senhaExclusaoCategoria.trim()) {
      setErroCategorias("Informe sua senha para confirmar a exclusão da categoria.");
      return;
    }

    try {
      setExcluindoCategoriaId(categoriaParaExcluir.id);
      const res = await fetch(`/api/v1/torneios/${slugAtual}/categorias/${categoriaParaExcluir.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senha: senhaExclusaoCategoria,
          forcar: true,
        }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao excluir categoria");
      }
      await recarregarDashboard();
      setCategoriaParaExcluir(null);
      setSenhaExclusaoCategoria("");
    } catch (e: any) {
      setErroCategorias(e?.message || "Erro inesperado");
    } finally {
      setExcluindoCategoriaId(null);
    }
  }

  async function gerarRelatorioJogosDoDia() {
    if (!torneio) return;
    
    try {
      setGerandoRelatorio(true);
      // Usar data local para evitar problemas de fuso horário
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const dia = String(hoje.getDate()).padStart(2, '0');
      const dataHoje = `${ano}-${mes}-${dia}`;
      
      const res = await fetch(`/api/v1/torneios/${slugAtual}/jogos-do-dia?data=${dataHoje}`);
      
      if (!res.ok) throw new Error("Falha ao buscar jogos do dia");
      
      const data = await res.json();
      const partidas = data.partidas;
      
      if (!partidas || partidas.length === 0) {
        alert("Nenhum jogo agendado para hoje.");
        return;
      }

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
            @media print {
              .no-print { display: none; }
              body { padding: 0; margin: 0; }
              .page-break { page-break-after: always; }
            }
            body { background-color: white; font-family: sans-serif; }
            .card-partida { break-inside: avoid; border: 1px solid #e2e8f0; margin-bottom: 1rem; border-radius: 0.75rem; overflow: hidden; }
            #capture-target { padding: 2rem; background: white; }
          </style>
          <script>
            async function gerarImagem() {
              const btn = document.getElementById('btn-gerar-imagem');
              const btnPrint = document.getElementById('btn-imprimir');
              const originalText = btn.innerText;
              
              try {
                btn.innerText = 'Processando...';
                btn.disabled = true;
                
                // Pequeno delay para garantir que imagens foram carregadas e o layout estabilizou
                await new Promise(r => setTimeout(r, 500));
                
                const element = document.getElementById('capture-target');
                const canvas = await html2canvas(element, {
                  useCORS: true,
                  scale: 2, // Melhor qualidade
                  backgroundColor: '#ffffff',
                  logging: false
                });
                
                const link = document.createElement('a');
                link.download = \`jogos-do-dia-\${new Date().toISOString().split('T')[0]}.png\`;
                link.href = canvas.toDataURL('image/png');
                link.click();
              } catch (err) {
                console.error('Erro ao gerar imagem:', err);
                alert('Erro ao gerar imagem. Verifique o console.');
              } finally {
                btn.innerText = originalText;
                btn.disabled = false;
              }
            }
          </script>
        </head>
        <body class="p-4 md:p-8 bg-slate-100">
          <div class="max-w-4xl mx-auto">
            <div class="no-print flex justify-end gap-3 mb-6">
              <button id="btn-gerar-imagem" onclick="gerarImagem()" class="bg-orange-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-600">Gerar Imagem (PNG)</button>
              <button id="btn-imprimir" onclick="window.print()" class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium">Imprimir Relatório</button>
            </div>

            <div id="capture-target" class="shadow-xl rounded-2xl">
              ${torneio.bannerUrl ? `
                <div class="mb-8 w-full">
                  <img src="/api/image-proxy?url=${encodeURIComponent(torneio.bannerUrl)}" alt="Banner Torneio" class="w-full h-auto rounded-xl shadow-sm" crossOrigin="anonymous" />
                </div>
              ` : ''}

              <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-slate-900">${torneio.nome}</h1>
                <p class="text-lg text-slate-600">Jogos do Dia - ${new Date().toLocaleDateString('pt-BR')}</p>
              </div>

              <div class="grid grid-cols-1 gap-6">
                ${partidas.map((p: any) => {
                  const dataHora = p.dataHorario ? new Date(p.dataHorario) : null;
                  const horaFormatada = dataHora ? dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                  const placeholder = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiNlMmU4ZjAiLz48dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtc2l6ZT0iMzUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmaWxsPSIjOTRhN2IzIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXdlaWdodD0iYm9sZCI+UE48L3RleHQ+PC9zdmc+";
                  
                  return `
                    <div class="card-partida bg-white">
                      <div class="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                        <span class="font-bold text-slate-700 uppercase tracking-wider text-xs">${p.categoriaNome}</span>
                        <span class="text-xs font-medium text-slate-500">${p.fase}</span>
                      </div>
                      
                      <div class="p-6">
                        <div class="flex items-center justify-between gap-8">
                          <!-- Time A -->
                          <div class="flex-1 flex flex-col items-center text-center">
                            <div class="flex -space-x-2 mb-3">
                              ${p.equipeAAtletas.map((a: any) => `
                                <img src="${a.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a.fotoUrl)}` : placeholder}" 
                                  class="h-14 w-14 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm" 
                                  onerror="this.src='${placeholder}'" 
                                  crossOrigin="anonymous" />
                              `).join('')}
                            </div>
                            <span class="font-bold text-slate-900 leading-tight">${p.equipeANome || 'A definir'}</span>
                            <span class="text-xs text-slate-500 mt-1">${p.equipeAAtletas.map((a: any) => a.nome).join(' / ')}</span>
                          </div>

                          <div class="flex flex-col items-center px-4">
                            <span class="text-2xl font-black text-slate-300">VS</span>
                          </div>

                          <!-- Time B -->
                          <div class="flex-1 flex flex-col items-center text-center">
                            <div class="flex -space-x-2 mb-3">
                              ${p.equipeBAtletas.map((a: any) => `
                                <img src="${a.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a.fotoUrl)}` : placeholder}" 
                                  class="h-14 w-14 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm" 
                                  onerror="this.src='${placeholder}'" 
                                  crossOrigin="anonymous" />
                              `).join('')}
                            </div>
                            <span class="font-bold text-slate-900 leading-tight">${p.equipeBNome || 'A definir'}</span>
                            <span class="text-xs text-slate-500 mt-1">${p.equipeBAtletas.map((a: any) => a.nome).join(' / ')}</span>
                          </div>
                        </div>
                      </div>

                      <div class="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-between items-center text-sm">
                        <div class="flex items-center gap-2 text-slate-700 font-bold">
                          <svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          ${horaFormatada}
                        </div>
                        <div class="flex items-center gap-2 text-slate-700 font-medium">
                          <svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          ${p.arenaNome || 'A definir'} ${p.quadra ? `- ${p.quadra}` : ''}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
              
              <footer class="mt-12 pt-8 border-t border-slate-100 text-center text-slate-400 text-xs">
                Gerado em ${new Date().toLocaleString('pt-BR')} por Play Na Quadra
              </footer>
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

  const inputCls =
    "h-10 w-full rounded-[10px] border border-[#d9d5cc] bg-white px-3 text-sm text-ink outline-none focus:border-[#b5b2aa] focus:ring-2 focus:ring-signal/15";

  const categoriasLotadas = categorias.filter((c) => {
    const ocupadas = Math.max(0, (c.inscricoesTotal ?? 0) - (c.inscricoesRecusadas ?? 0));
    return Boolean(c.vagasMaximas && c.vagasMaximas > 0 && ocupadas >= c.vagasMaximas);
  });
  const categoriasSemHorario = categorias.filter((c) => !c.dataHorario);
  const pendentes = stats?.inscricoesPendentes ?? 0;
  const filaEspera = stats?.inscricoesFilaEspera ?? 0;
  const alertas: Array<{ texto: string; href?: string; onClick?: () => void; tom: "signal" | "warning" | "neutral" }> = [];
  if (pendentes > 0) alertas.push({ texto: `${pendentes} inscrição(ões) aguardando aprovação`, href: `/admin/torneios/${slugAtual}/atletas-inscritos`, tom: "signal" });
  if (filaEspera > 0) alertas.push({ texto: `${filaEspera} na fila de espera`, href: `/admin/torneios/${slugAtual}/atletas-inscritos`, tom: "warning" });
  if (categoriasLotadas.length > 0)
    alertas.push({ texto: `${categoriasLotadas.length} categoria(s) lotada(s): ${categoriasLotadas.map((c) => c.nome).join(", ")}`, tom: "neutral" });
  if (categoriasSemHorario.length > 0)
    alertas.push({ texto: `${categoriasSemHorario.length} categoria(s) sem data/horário definidos`, tom: "neutral" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description={
          torneio ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <TorneioStatusBadge status={torneio.status} />
              <span className="font-semibold text-ink">{torneio.nome}</span>
              <span className="text-muted">·</span>
              <span>{periodoTorneio(torneio)}</span>
              {torneio.local && (
                <>
                  <span className="text-muted">·</span>
                  <span>{torneio.local}</span>
                </>
              )}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Menu
              items={[
                { label: "Editar dados do torneio", icon: <Settings2 />, href: `/admin/torneios/${slugAtual}/editar` },
                {
                  label: clonandoTorneioId === torneio?.id ? "Clonando…" : "Clonar torneio",
                  icon: <Copy />,
                  onSelect: abrirClonarTorneio,
                  disabled: !torneio || Boolean(clonandoTorneioId),
                },
                { label: "Importar Excel", icon: <FileUp />, href: `/admin/torneios/${slugAtual}/importar-supercampeonato` },
                "separator",
                { label: "Página pública", icon: <ExternalLink />, href: `/torneios/${slugAtual}`, external: true },
              ]}
              trigger={({ toggle }) => (
                <Button onClick={toggle} aria-label="Mais ações do torneio" className="w-10 px-0">
                  <MoreHorizontal />
                </Button>
              )}
            />
            <Button
              disabled={gerandoCardProgramacao || categorias.length === 0}
              onClick={() => void gerarCardProgramacaoTorneio()}
              title={categorias.length === 0 ? "Cadastre ao menos 1 categoria para gerar o card" : "Gerar card da programação (categorias e horários)"}
              icon={<ImageIcon />}
            >
              {gerandoCardProgramacao ? "Gerando…" : "Card da programação"}
            </Button>
            <Button variant="primary" onClick={abrirNovaCategoria} icon={<Plus />}>
              Nova categoria
            </Button>
          </>
        }
      />

      {carregando && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[108px] animate-pulse rounded-[14px] border border-line bg-white" />
          ))}
        </div>
      )}

      {!carregando && !torneio && erro && <Alert>{erro}</Alert>}

      {!carregando && torneio && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Inscrições" value={stats?.inscricoesTotal ?? 0} hint={`${categorias.length} categoria(s)`} />
            <StatCard
              label="Aguardando aprovação"
              value={pendentes}
              tone={pendentes > 0 ? "signal" : "default"}
              hint={
                pendentes > 0 ? (
                  <Link href={`/admin/torneios/${slugAtual}/atletas-inscritos`} className="text-signal-strong hover:underline">
                    Revisar agora
                  </Link>
                ) : (
                  "Tudo em dia"
                )
              }
            />
            <StatCard label="Aprovadas" value={stats?.inscricoesAprovadas ?? 0} hint="Confirmadas nas categorias" />
            <StatCard label="Fila de espera" value={filaEspera} hint={`${stats?.inscricoesRecusadas ?? 0} recusada(s)`} />
          </div>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card id="categorias" className="scroll-mt-24 overflow-hidden">
              <CardHeader
                title="Categorias"
                description="Abra os jogos, acompanhe as inscrições e ajuste cada categoria."
                actions={
                  <Button size="sm" onClick={abrirNovaCategoria} icon={<Plus />}>
                    Adicionar
                  </Button>
                }
              />

              {erroCategorias && <Alert className="m-4">{erroCategorias}</Alert>}

              {mostraFormCategoria && (
                <form onSubmit={onSalvarCategoria} className="space-y-4 border-b border-line bg-paper px-4 py-5 sm:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-extrabold text-ink">{editandoCategoriaId ? "Editar categoria" : "Nova categoria"}</div>
                    <Button variant="ghost" size="sm" onClick={cancelarCategoria} icon={<X />}>
                      Fechar
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-1.5">
                      <span className="text-[13px] font-semibold text-ink">Nome *</span>
                      <input
                        value={formCategoria.nome}
                        onChange={(e) => setFormCategoria((p) => ({ ...p, nome: e.target.value }))}
                        placeholder="Ex: Mista C"
                        className={inputCls}
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[13px] font-semibold text-ink">Gênero *</span>
                      <select
                        value={formCategoria.genero}
                        onChange={(e) => setFormCategoria((p) => ({ ...p, genero: e.target.value as Categoria["genero"] }))}
                        className={inputCls}
                      >
                        <option value="MASCULINO">Masculino</option>
                        <option value="FEMININO">Feminino</option>
                        <option value="MISTO">Misto</option>
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[13px] font-semibold text-ink">Valor por atleta</span>
                      <input
                        value={formCategoria.valorInscricao}
                        onChange={(e) => setFormCategoria((p) => ({ ...p, valorInscricao: e.target.value }))}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        className={inputCls}
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[13px] font-semibold text-ink">Vagas máximas</span>
                      <input
                        value={formCategoria.vagasMaximas}
                        onChange={(e) => setFormCategoria((p) => ({ ...p, vagasMaximas: e.target.value }))}
                        type="number"
                        step="1"
                        min="0"
                        placeholder="32"
                        className={inputCls}
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[13px] font-semibold text-ink">Data/Hora da categoria</span>
                      <input
                        value={formCategoria.dataHorario}
                        onChange={(e) => setFormCategoria((p) => ({ ...p, dataHorario: e.target.value }))}
                        type="datetime-local"
                        className={inputCls}
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[13px] font-semibold text-ink">Modelo do card de inscrição</span>
                      <select
                        value={formCategoria.tipoCardInscricao}
                        onChange={(e) => setFormCategoria((p) => ({ ...p, tipoCardInscricao: e.target.value as "TIPO_1" | "TIPO_2" }))}
                        className={inputCls}
                      >
                        <option value="TIPO_1">Tipo 1 — Padrão (com programação)</option>
                        <option value="TIPO_2">Tipo 2 — Fotos maiores e centralizadas</option>
                      </select>
                      <span className="block text-xs text-muted">
                        Tipo 1 exibe a programação das categorias. Tipo 2 prioriza fotos maiores e centralizadas.
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button onClick={cancelarCategoria}>Cancelar</Button>
                    <Button type="submit" variant="primary" disabled={!podeSalvarCategoria || salvandoCategoria} icon={<Save />}>
                      {salvandoCategoria ? "Salvando…" : "Salvar categoria"}
                    </Button>
                  </div>
                </form>
              )}

              {categorias.length === 0 ? (
                <EmptyState
                  icon={<Ticket />}
                  title="Nenhuma categoria cadastrada"
                  description="Crie as categorias para abrir as inscrições e montar os jogos."
                  action={
                    <Button variant="primary" onClick={abrirNovaCategoria} icon={<Plus />}>
                      Nova categoria
                    </Button>
                  }
                />
              ) : (
                <ul>
                  {categorias.map((cat) => {
                    const ocupadas = Math.max(0, (cat.inscricoesTotal ?? 0) - (cat.inscricoesRecusadas ?? 0));
                    const totalVagas = cat.vagasMaximas;
                    const percent = totalVagas && totalVagas > 0 ? Math.min(100, Math.round((ocupadas / totalVagas) * 100)) : null;
                    const barColor = percent === null ? "bg-[#d3cfc7]" : percent >= 100 ? "bg-signal" : percent >= 80 ? "bg-[#e0a526]" : "bg-[#1e7f4f]";
                    const base = `/admin/torneios/${slugAtual}/categorias/${cat.id}`;

                    return (
                      <li
                        key={cat.id}
                        className="grid grid-cols-1 gap-3 border-b border-sand-2 px-4 py-4 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6"
                      >
                        <Link href={`${base}/jogos`} className="group min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[15px] font-extrabold text-ink group-hover:underline group-hover:underline-offset-4">
                              {cat.nome}
                            </span>
                            {(cat.inscricoesPendentes ?? 0) > 0 && (
                              <Badge tone="signal">{cat.inscricoesPendentes} pendente(s)</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted">
                            {GENERO_LABEL[cat.genero] ?? cat.genero}
                            {cat.dataHorario ? ` · ${formatDataHora(cat.dataHorario)}` : " · sem horário"}
                            {" · "}
                            {cat.valorInscricao
                              ? `${Number(cat.valorInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por atleta`
                              : "sem taxa"}
                          </div>
                        </Link>

                        <div className="min-w-0">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold tabular-nums text-ink">
                              {totalVagas ? `${ocupadas}/${totalVagas}` : ocupadas} inscrições
                            </span>
                            <span className="text-muted">{totalVagas ? `${percent ?? 0}%` : "Sem limite"}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sand-2">
                            <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${totalVagas ? percent ?? 0 : 100}%`, opacity: totalVagas ? 1 : 0.35 }} />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <LinkButton href={`${base}/jogos`} size="sm" icon={<Gamepad2 />} className="flex-1 lg:flex-none">
                            Jogos
                          </LinkButton>
                          <LinkButton href={`${base}/inscricoes`} size="sm" icon={<Ticket />} className="flex-1 lg:flex-none">
                            Inscrições
                          </LinkButton>
                          <Menu
                            items={[
                              { label: "Modo árbitro", icon: <Smartphone />, href: `${base}/jogos/arbitro` },
                              { label: "Editar categoria", icon: <Pencil />, onSelect: () => abrirEditarCategoria(cat) },
                              {
                                label: clonandoCategoriaId === cat.id ? "Clonando…" : "Clonar categoria",
                                icon: <Copy />,
                                onSelect: () => abrirClonarCategoria(cat),
                                disabled: Boolean(clonandoCategoriaId),
                              },
                              "separator",
                              {
                                label: excluindoCategoriaId === cat.id ? "Excluindo…" : "Excluir categoria",
                                icon: <Trash2 />,
                                danger: true,
                                onSelect: () => void onExcluirCategoria(cat.id),
                                disabled: excluindoCategoriaId === cat.id,
                              },
                            ]}
                            trigger={({ toggle }) => (
                              <Button size="sm" variant="ghost" onClick={toggle} aria-label={`Mais ações de ${cat.nome}`} className="w-9 px-0">
                                <MoreHorizontal />
                              </Button>
                            )}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="flex flex-col gap-5">
              <Card className="p-4 sm:p-5">
                <div className="flex items-center gap-2 text-base font-extrabold text-ink">
                  <AlertTriangle className="h-[18px] w-[18px] text-signal-strong" />
                  Precisa de atenção
                </div>
                {alertas.length === 0 ? (
                  <p className="mt-3 text-[13px] text-muted">Nenhuma pendência no momento.</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {alertas.map((a, idx) => {
                      const cls = `flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold ${
                        a.tom === "signal" ? "bg-signal-soft text-[#7c2d12]" : a.tom === "warning" ? "bg-[#fdf1dc] text-[#6b3d00]" : "bg-sand-2 text-ink-2"
                      }`;
                      return a.href ? (
                        <Link key={idx} href={a.href} className={`${cls} hover:brightness-[0.98]`}>
                          <span>{a.texto}</span>
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        </Link>
                      ) : (
                        <div key={idx} className={cls}>
                          <span>{a.texto}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="px-4 pt-4 text-base font-extrabold text-ink sm:px-5">Operação do dia</div>
                <nav className="p-2">
                  {[
                    { href: `/admin/torneios/${slugAtual}/jogos-do-dia`, label: "Jogos do dia", desc: "Agenda por data e quadra", icon: <Calendar /> },
                    { href: `/admin/torneios/${slugAtual}/painel-quadras`, label: "Painel de quadras", desc: "Acompanhamento ao vivo", icon: <Gamepad2 /> },
                    { href: `/admin/torneios/${slugAtual}/cobranca`, label: "Cobrança", desc: "Pagamentos das inscrições", icon: <DollarSign /> },
                    { href: `/admin/torneios/${slugAtual}/comunicacoes`, label: "Comunicações", desc: "Mensagens aos atletas", icon: <MessageSquare /> },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 hover:bg-sand [&>span>svg]:h-[18px] [&>span>svg]:w-[18px]"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sand-2 text-ink-2">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-ink">{item.label}</span>
                        <span className="block text-xs text-muted">{item.desc}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </Link>
                  ))}
                </nav>
              </Card>
            </div>
          </div>
        </>
      )}

      {categoriaParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={fecharModalExcluirCategoria}>
          <div
            className="w-full max-w-xl rounded-2xl border border-red-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-red-100 bg-red-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-red-700">Exclusão permanente</div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Excluir categoria com inscrições e jogos</h3>
                  <p className="mt-2 text-sm text-slate-700">
                    Esta ação é destrutiva e não poderá ser desfeita.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fecharModalExcluirCategoria}
                  disabled={Boolean(excluindoCategoriaId)}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <div className="font-semibold">Você está prestes a excluir a categoria `{categoriaParaExcluir.nome}`.</div>
                <div className="mt-2">
                  O sistema removerá os dados relacionados a esta categoria, incluindo inscrições, jogos, grupos,
                  placares pendentes, configurações e vínculos internos necessários para o torneio continuar íntegro.
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Categoria</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{categoriaParaExcluir.nome}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inscrições</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{categoriaParaExcluir.inscricoesTotal ?? 0}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">Exclusão forçada</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Digite sua senha para confirmar</label>
                <input
                  type="password"
                  value={senhaExclusaoCategoria}
                  onChange={(e) => setSenhaExclusaoCategoria(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Sua senha de administrador"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-500/10"
                />
                <div className="text-xs text-slate-500">
                  A exclusão só será executada após a validação da sua senha atual.
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={fecharModalExcluirCategoria}
                  disabled={Boolean(excluindoCategoriaId)}
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarExclusaoCategoria()}
                  disabled={excluindoCategoriaId === categoriaParaExcluir.id}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  {excluindoCategoriaId === categoriaParaExcluir.id ? "Excluindo categoria..." : "Excluir categoria definitivamente"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {categoriaParaClonar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={fecharModalClonarCategoria}>
          <div
            className="w-full max-w-xl rounded-2xl border border-orange-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-orange-100 bg-orange-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-orange-700">Clonagem de categoria</div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Criar nova categoria a partir da original</h3>
                  <p className="mt-2 text-sm text-slate-700">
                    Você escolhe se quer manter as inscrições da categoria original. Aqui você altera o nome e decide o que copiar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fecharModalClonarCategoria}
                  disabled={Boolean(clonandoCategoriaId)}
                  className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                <div className="font-semibold">Categoria de origem: {categoriaParaClonar.nome}</div>
                <div className="mt-2">
                  Serão clonados o gênero, taxa, vagas, data/hora e a configuração da modalidade.
                  Jogos, grupos e chave não serão copiados.
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Origem</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{categoriaParaClonar.nome}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gênero</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{categoriaParaClonar.genero}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inscrições</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{categoriaParaClonar.inscricoesTotal ?? 0}</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Novo nome da categoria</label>
                <input
                  type="text"
                  value={nomeCloneCategoria}
                  onChange={(e) => setNomeCloneCategoria(e.target.value)}
                  placeholder="Ex.: Masculino B"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/10"
                />
                <div className="text-xs text-slate-500">
                  A rotina de clonagem permite alterar somente o nome da nova categoria. Os demais dados vêm da categoria original.
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-700">Manter inscrições da categoria original?</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setManterInscricoesCloneCategoria(true)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      manterInscricoesCloneCategoria
                        ? "border-orange-300 bg-orange-50 text-orange-900 ring-2 ring-orange-500/10"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-semibold">Sim, manter inscrições</div>
                    <div className="mt-1 text-xs">
                      Copia as inscrições e pagamentos dos atletas para a nova categoria.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManterInscricoesCloneCategoria(false)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      !manterInscricoesCloneCategoria
                        ? "border-orange-300 bg-orange-50 text-orange-900 ring-2 ring-orange-500/10"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-semibold">Não, começar vazia</div>
                    <div className="mt-1 text-xs">
                      Cria só a categoria com a mesma configuração, sem copiar nenhuma inscrição.
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={fecharModalClonarCategoria}
                  disabled={Boolean(clonandoCategoriaId)}
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarClonagemCategoria()}
                  disabled={clonandoCategoriaId === categoriaParaClonar.id}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 sm:w-auto"
                >
                  <Copy className="h-4 w-4" />
                  {clonandoCategoriaId === categoriaParaClonar.id ? "Clonando categoria..." : "Clonar categoria"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {torneioParaClonar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={fecharModalClonarTorneio}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-orange-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-orange-100 bg-orange-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-orange-700">Clonagem de torneio</div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">Criar um novo torneio com a mesma estrutura</h3>
                  <p className="mt-2 text-sm text-slate-700">
                    O sistema vai copiar dados do torneio, categorias, configurações, arenas, apoiadores e patrocinadores.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fecharModalClonarTorneio}
                  disabled={Boolean(clonandoTorneioId)}
                  className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                <div className="font-semibold">Torneio de origem: {torneioParaClonar.nome}</div>
                <div className="mt-2">
                  A cópia nasce em `RASCUNHO` e ficará oculta até você revisar. Inscrições, pagamentos, equipes, grupos, jogos,
                  rodadas e comunicações não serão clonados.
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Origem</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{torneioParaClonar.nome}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Categorias</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{categorias.length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Novo status</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">RASCUNHO / Oculto</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Novo nome do torneio</label>
                <input
                  type="text"
                  value={nomeCloneTorneio}
                  onChange={(e) => setNomeCloneTorneio(e.target.value)}
                  placeholder="Ex.: Circuito Verão 2027"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/10"
                />
                <div className="text-xs text-slate-500">
                  O slug será gerado automaticamente a partir do novo nome, com ajuste de unicidade quando necessário.
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={fecharModalClonarTorneio}
                  disabled={Boolean(clonandoTorneioId)}
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarClonagemTorneio()}
                  disabled={clonandoTorneioId === torneioParaClonar.id}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 sm:w-auto"
                >
                  <Copy className="h-4 w-4" />
                  {clonandoTorneioId === torneioParaClonar.id ? "Clonando torneio..." : "Clonar torneio"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
