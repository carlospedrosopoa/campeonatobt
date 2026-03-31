"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Calendar, ExternalLink, Gamepad2, Handshake, List, MapPin, Pencil, Plus, Save, Ticket, Trash2, Users, X } from "lucide-react";

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
  const slugAtual = params.slug;

  const [torneio, setTorneio] = useState<Torneio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erroCategorias, setErroCategorias] = useState<string | null>(null);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [editandoCategoriaId, setEditandoCategoriaId] = useState<string | null>(null);
  const [mostraFormCategoria, setMostraFormCategoria] = useState(false);
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);
  const [excluindoCategoriaId, setExcluindoCategoriaId] = useState<string | null>(null);
  const [formCategoria, setFormCategoria] = useState({
    nome: "",
    genero: "MISTO" as Categoria["genero"],
    valorInscricao: "",
    vagasMaximas: "",
  });

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
    setFormCategoria({ nome: "", genero: "MISTO", valorInscricao: "", vagasMaximas: "" });
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
    });
    setErroCategorias(null);
  }

  function cancelarCategoria() {
    setMostraFormCategoria(false);
    setEditandoCategoriaId(null);
    setFormCategoria({ nome: "", genero: "MISTO", valorInscricao: "", vagasMaximas: "" });
    setErroCategorias(null);
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
    setErroCategorias(null);
    const ok = window.confirm("Deseja excluir esta categoria?");
    if (!ok) return;

    try {
      setExcluindoCategoriaId(categoriaId);
      const res = await fetch(`/api/v1/torneios/${slugAtual}/categorias/${categoriaId}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao excluir categoria");
      }
      await recarregarDashboard();
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/torneios" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{torneio ? torneio.nome : "Torneio"}</h1>
          <p className="text-sm text-slate-600">Dashboard e gerenciamento de categorias.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/torneios/${slugAtual}/editar`}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Editar dados
          </Link>
          <Link
            href={`/admin/torneios/${slugAtual}/arenas`}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <MapPin className="h-4 w-4" />
            Arenas
          </Link>
          <Link
            href={`/admin/torneios/${slugAtual}/apoiadores`}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Handshake className="h-4 w-4" />
            Apoiadores
          </Link>
          {torneio && (
            <>
              <button
                type="button"
                onClick={gerarRelatorioJogosDoDia}
                disabled={gerandoRelatorio}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Calendar className="h-4 w-4" />
                {gerandoRelatorio ? "Gerando..." : "Jogos do dia"}
              </button>
              <Link
                href={`/torneios/${torneio.slug}`}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                Público
              </Link>
            </>
          )}
        </div>
      </div>

      {carregando && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-slate-600">Carregando…</div>
      )}

      {!carregando && !torneio && erro && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-red-600">{erro}</div>
      )}

      {!carregando && torneio && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Categorias</div>
                  <div className="text-2xl font-bold text-slate-900">{stats?.categoriasTotal ?? categorias.length}</div>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <List className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Inscrições</div>
                  <div className="text-2xl font-bold text-slate-900">{stats?.inscricoesTotal ?? 0}</div>
                </div>
                <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Users className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Pendentes</div>
                  <div className="text-2xl font-bold text-slate-900">{stats?.inscricoesPendentes ?? 0}</div>
                </div>
                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-slate-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Aprovadas</div>
                  <div className="text-2xl font-bold text-slate-900">{stats?.inscricoesAprovadas ?? 0}</div>
                </div>
                <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Categorias</h2>
                <p className="text-sm text-slate-600">Crie e edite as categorias do torneio.</p>
              </div>
              <button
                type="button"
                onClick={abrirNovaCategoria}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Nova categoria
              </button>
            </div>

            {erroCategorias && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erroCategorias}</div>
            )}

            {mostraFormCategoria && (
              <form onSubmit={onSalvarCategoria} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">
                    {editandoCategoriaId ? "Editar categoria" : "Nova categoria"}
                  </div>
                  <button
                    type="button"
                    onClick={cancelarCategoria}
                    className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
                  >
                    <X className="h-4 w-4" />
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Nome *</label>
                    <input
                      value={formCategoria.nome}
                      onChange={(e) => setFormCategoria((p) => ({ ...p, nome: e.target.value }))}
                      placeholder="Ex: Mista C"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Gênero *</label>
                    <select
                      value={formCategoria.genero}
                      onChange={(e) => setFormCategoria((p) => ({ ...p, genero: e.target.value as Categoria["genero"] }))}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
                    >
                      <option value="MASCULINO">MASCULINO</option>
                      <option value="FEMININO">FEMININO</option>
                      <option value="MISTO">MISTO</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Valor por atleta</label>
                    <input
                      value={formCategoria.valorInscricao}
                      onChange={(e) => setFormCategoria((p) => ({ ...p, valorInscricao: e.target.value }))}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Vagas máximas</label>
                    <input
                      value={formCategoria.vagasMaximas}
                      onChange={(e) => setFormCategoria((p) => ({ ...p, vagasMaximas: e.target.value }))}
                      type="number"
                      step="1"
                      min="0"
                      placeholder="32"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={cancelarCategoria}
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!podeSalvarCategoria || salvandoCategoria}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {salvandoCategoria ? "Salvando…" : "Salvar categoria"}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="py-3 pr-4 font-medium">Nome</th>
                    <th className="py-3 pr-4 font-medium">Gênero</th>
                    <th className="py-3 pr-4 font-medium">Taxa (por atleta)</th>
                    <th className="py-3 pr-4 font-medium">Vagas</th>
                    <th className="py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        Nenhuma categoria cadastrada.
                      </td>
                    </tr>
                  )}

                  {categorias.map((cat) => {
                    const ocupadas = Math.max(0, (cat.inscricoesTotal ?? 0) - (cat.inscricoesRecusadas ?? 0));
                    const totalVagas = cat.vagasMaximas;
                    const percent =
                      totalVagas && totalVagas > 0 ? Math.min(100, Math.round((ocupadas / totalVagas) * 100)) : null;
                    const barColor =
                      percent === null
                        ? "bg-slate-200"
                        : percent >= 100
                          ? "bg-red-500"
                          : percent >= 80
                            ? "bg-orange-500"
                            : "bg-green-500";

                    return (
                      <tr key={cat.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                        <td className="py-4 pr-4 font-medium text-slate-900">{cat.nome}</td>
                        <td className="py-4 pr-4 text-slate-700">{cat.genero}</td>
                        <td className="py-4 pr-4 text-slate-700">
                          {cat.valorInscricao ? Number(cat.valorInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"}
                        </td>
                        <td className="py-4 pr-4 text-slate-700">
                          <div className="space-y-1 min-w-[180px]">
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>{ocupadas} inscr.</span>
                              <span>{totalVagas ? `${ocupadas}/${totalVagas}` : "Sem limite"}</span>
                            </div>
                            {totalVagas ? (
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-2 ${barColor}`} style={{ width: `${percent ?? 0}%` }} />
                              </div>
                            ) : (
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-2 bg-slate-200" style={{ width: "35%" }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Link
                              href={`/admin/torneios/${slugAtual}/categorias/${cat.id}/inscricoes`}
                              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Ticket className="h-4 w-4" />
                              Inscrições
                            </Link>
                            <Link
                              href={`/admin/torneios/${slugAtual}/categorias/${cat.id}/jogos`}
                              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Gamepad2 className="h-4 w-4" />
                              Jogos
                            </Link>
                            <button
                              type="button"
                              onClick={() => abrirEditarCategoria(cat)}
                              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => onExcluirCategoria(cat.id)}
                              disabled={excluindoCategoriaId === cat.id}
                              className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              {excluindoCategoriaId === cat.id ? "Excluindo…" : "Excluir"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
