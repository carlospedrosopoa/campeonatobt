"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Calendar, FileText, ImageIcon, MapPin, RefreshCw, Users } from "lucide-react";
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

const avatarPlaceholder =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiNlMmU4ZjAiLz48dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtc2l6ZT0iMzUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmaWxsPSIjOTRhN2IzIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXdlaWdodD0iYm9sZCI+UE48L3RleHQ+PC9zdmc+";

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

export default function AdminJogosDoDiaPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [torneio, setTorneio] = useState<Torneio | null>(null);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [sincronizandoFotos, setSincronizandoFotos] = useState(false);

  async function carregarDados() {
    try {
      setCarregando(true);
      setErro(null);
      
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const dia = String(hoje.getDate()).padStart(2, '0');
      const dataHoje = `${ano}-${mes}-${dia}`;

      const res = await fetch(`/api/v1/torneios/${slug}/jogos-do-dia?data=${dataHoje}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar jogos do dia");
      
      const data = await res.json();
      setTorneio(data.torneio);
      setPartidas(data.partidas);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarDados();
  }, [slug]);

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
    return d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  async function gerarCardPartida(p: Partida) {
    try {
      setErro(null);
      await gerarCardPartidaAdmin({
        torneioNome: torneio?.nome || "Torneio",
        categoriaNome: p.categoriaNome || "Categoria",
        templateUrl: torneio?.templateUrl,
        syncFotosUrl: `/api/public/torneios/${slug}/categorias/${p.categoriaId}/partidas/${p.id}/sincronizar-fotos`,
        partida: {
          id: p.id,
          fase: p.fase,
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

  async function sincronizarFotos() {
    try {
      setErro(null);
      if (partidas.length === 0) return;

      setSincronizandoFotos(true);

      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = String(hoje.getMonth() + 1).padStart(2, "0");
      const dia = String(hoje.getDate()).padStart(2, "0");
      const dataHoje = `${ano}-${mes}-${dia}`;

      const res = await fetch(`/api/v1/torneios/${slug}/jogos-do-dia?data=${dataHoje}`, {
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

      await carregarDados();

      alert(
        `Sincronização concluída.\n\nAtletas (jogos listados): ${totalAtletas}\nCom Play ID: ${totalComPlayId}\nConsultados: ${consultados}\nAtualizados: ${atualizados}\nJá atualizados: ${jaAtualizados}\nSem foto no Play: ${semFotoNoPlay}\nFalhas: ${falhasConsulta}`
      );
    } catch (e: any) {
      setErro(e?.message || "Erro ao sincronizar fotos");
    } finally {
      setSincronizandoFotos(false);
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
              const src = a.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a.fotoUrl)}` : avatarPlaceholder;
              return `<img src="${src}" class="h-14 w-14 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm" onerror="this.src='${avatarPlaceholder}'" crossOrigin="anonymous" />`;
            })
            .join("");

          const atletasBHtml = equipeBAtletas
            .map((a) => {
              const src = a.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a.fotoUrl)}` : avatarPlaceholder;
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
                <p class="text-lg text-slate-600">Jogos do Dia - ${new Date().toLocaleDateString('pt-BR')}</p>
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
            {torneio?.nome} • {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sincronizarFotos}
            disabled={sincronizandoFotos || partidas.length === 0 || carregando}
            className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            {sincronizandoFotos ? "Atualizando fotos..." : "Atualizar fotos"}
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
            onClick={carregarDados}
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
            <p className="text-slate-500 font-medium">Nenhum jogo agendado para hoje.</p>
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
                        <img
                          key={a.id}
                          src={a.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a.fotoUrl)}` : avatarPlaceholder}
                          onError={(e) => {
                            const el = e.currentTarget as HTMLImageElement;
                            el.src = avatarPlaceholder;
                          }}
                          className="h-9 w-9 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm"
                          alt={a.nome}
                        />
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
                    <span className="text-sm font-black text-slate-300 italic">VS</span>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="flex items-center justify-center -space-x-2 mb-2">
                      {(p.equipeBAtletas ?? []).slice(0, 2).map((a) => (
                        <img
                          key={a.id}
                          src={a.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(a.fotoUrl)}` : avatarPlaceholder}
                          onError={(e) => {
                            const el = e.currentTarget as HTMLImageElement;
                            el.src = avatarPlaceholder;
                          }}
                          className="h-9 w-9 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm"
                          alt={a.nome}
                        />
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
    </div>
  );
}
