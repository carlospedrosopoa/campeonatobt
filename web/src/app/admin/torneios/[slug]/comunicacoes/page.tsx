"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, MessageSquare, RefreshCw, SendHorizontal } from "lucide-react";

type CategoriaResumo = {
  id: string;
  nome: string;
  dataHorario: string | null;
  totalDestinatarios: number;
};

type ComunicacaoResumo = {
  id: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  titulo: string | null;
  mensagem: string;
  enviarWhatsapp: boolean;
  publicarNoApp: boolean;
  totalDestinatarios: number;
  totalWhatsappEnviados: number;
  totalWhatsappFalhas: number;
  totalWhatsappSemTelefone: number;
  criadoEm: string;
  criadoPorNome: string | null;
};

type ApiResponse = {
  torneio: { id: string; nome: string; slug: string };
  categorias: CategoriaResumo[];
  preview: { totalDestinatarios: number };
  comunicacoes: ComunicacaoResumo[];
};

function formatarDataHora(value?: string | null) {
  if (!value) return "Agora";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Agora";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminTorneioComunicacoesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    categoriaId: "",
    titulo: "",
    mensagem: "",
    enviarWhatsapp: true,
    publicarNoApp: true,
  });

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/comunicacoes`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar comunicações");
      setData(payload as ApiResponse);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar comunicações");
    } finally {
      setCarregando(false);
    }
  }

  async function reenviarFalhas(item: ComunicacaoResumo) {
    if (!item.totalWhatsappFalhas || reenviandoId) return;
    if (!window.confirm(`Reenviar as ${item.totalWhatsappFalhas} falhas desta comunicação?`)) return;

    try {
      setErro(null);
      setReenviandoId(item.id);
      const res = await fetch(`/api/v1/torneios/${slug}/comunicacoes/${item.id}/reenviar`, {
        method: "POST",
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao reenviar comunicação");

      alert(
        `Reenvio concluído.\n\nTentativas reenviadas: ${payload?.totalReenviados ?? 0}\nWhatsApp enviados: ${payload?.totalWhatsappEnviados ?? 0}\nFalhas restantes: ${payload?.totalWhatsappFalhas ?? 0}\nSem telefone: ${payload?.totalWhatsappSemTelefone ?? 0}`
      );

      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao reenviar comunicação");
    } finally {
      setReenviandoId(null);
    }
  }

  useEffect(() => {
    void carregar();
  }, [slug]);

  const previewSelecionado = useMemo(() => {
    if (!data) return 0;
    if (!form.categoriaId) return data.preview.totalDestinatarios;
    return data.categorias.find((item) => item.id === form.categoriaId)?.totalDestinatarios ?? 0;
  }, [data, form.categoriaId]);

  async function enviarComunicacao(e: React.FormEvent) {
    e.preventDefault();
    if (!form.mensagem.trim()) {
      setErro("Informe a mensagem da comunicação.");
      return;
    }
    if (!form.enviarWhatsapp && !form.publicarNoApp) {
      setErro("Selecione ao menos um canal de envio.");
      return;
    }

    try {
      setErro(null);
      setEnviando(true);
      const res = await fetch(`/api/v1/torneios/${slug}/comunicacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoriaId: form.categoriaId || null,
          titulo: form.titulo,
          mensagem: form.mensagem,
          enviarWhatsapp: form.enviarWhatsapp,
          publicarNoApp: form.publicarNoApp,
        }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao enviar comunicação");

      alert(
        `Comunicação enviada.\n\nDestinatários: ${payload?.totalDestinatarios ?? 0}\nWhatsApp enviados: ${payload?.totalWhatsappEnviados ?? 0}\nFalhas: ${payload?.totalWhatsappFalhas ?? 0}\nSem telefone: ${payload?.totalWhatsappSemTelefone ?? 0}`
      );

      setForm((prev) => ({
        ...prev,
        titulo: "",
        mensagem: "",
      }));
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao enviar comunicação");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/torneios/${slug}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <MessageSquare className="h-6 w-6 text-blue-600" />
            Comunicações
          </h1>
          <p className="text-sm text-slate-600">
            Envie mensagens aos inscritos pelo WhatsApp e publique o mesmo conteúdo no appatleta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div> : null}

      {carregando && !data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">Carregando comunicações...</div>
      ) : null}

      {data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <form onSubmit={enviarComunicacao} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <div className="text-lg font-semibold text-slate-900">Nova comunicação</div>
              <div className="text-sm text-slate-600">
                Torneio: <span className="font-medium">{data.torneio.nome}</span>
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Categoria</span>
              <select
                value={form.categoriaId}
                onChange={(e) => setForm((prev) => ({ ...prev, categoriaId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
              >
                <option value="">Todas as categorias</option>
                {data.categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Título</span>
              <input
                value={form.titulo}
                onChange={(e) => setForm((prev) => ({ ...prev, titulo: e.target.value }))}
                placeholder="Ex.: Alteração na programação"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Mensagem</span>
              <textarea
                value={form.mensagem}
                onChange={(e) => setForm((prev) => ({ ...prev, mensagem: e.target.value }))}
                rows={8}
                placeholder="Digite a mensagem que será enviada aos inscritos."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={form.enviarWhatsapp}
                  onChange={(e) => setForm((prev) => ({ ...prev, enviarWhatsapp: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Enviar no WhatsApp</div>
                  <div className="text-xs text-slate-600">Usa a integração existente com o Gzappy.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={form.publicarNoApp}
                  onChange={(e) => setForm((prev) => ({ ...prev, publicarNoApp: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Publicar no appatleta</div>
                  <div className="text-xs text-slate-600">A mesma mensagem aparecerá na área de notificações.</div>
                </div>
              </label>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Destinatários previstos: <span className="font-semibold">{previewSelecionado}</span>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={enviando}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SendHorizontal className="h-4 w-4" />
                {enviando ? "Enviando..." : "Enviar comunicação"}
              </button>
            </div>
          </form>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <div className="text-lg font-semibold text-slate-900">Histórico recente</div>
              <div className="text-sm text-slate-600">Últimas comunicações registradas para este torneio.</div>
            </div>

            {data.comunicacoes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                Nenhuma comunicação enviada até o momento.
              </div>
            ) : (
              <div className="space-y-3">
                {data.comunicacoes.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{item.titulo || "Comunicado do torneio"}</div>
                        <div className="text-xs text-slate-500">
                          {item.categoriaNome || "Todas as categorias"} • {formatarDataHora(item.criadoEm)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>{item.criadoPorNome || "Admin"}</div>
                      </div>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.mensagem}</div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <div>Destinatários: <span className="font-semibold text-slate-900">{item.totalDestinatarios}</span></div>
                      <div>WhatsApp enviados: <span className="font-semibold text-slate-900">{item.totalWhatsappEnviados}</span></div>
                      <div>Falhas: <span className="font-semibold text-slate-900">{item.totalWhatsappFalhas}</span></div>
                      <div>Sem telefone: <span className="font-semibold text-slate-900">{item.totalWhatsappSemTelefone}</span></div>
                      <div>Canais: <span className="font-semibold text-slate-900">{item.enviarWhatsapp ? "WhatsApp" : ""}{item.enviarWhatsapp && item.publicarNoApp ? " + " : ""}{item.publicarNoApp ? "App" : ""}</span></div>
                    </div>
                    {item.enviarWhatsapp && item.totalWhatsappFalhas > 0 ? (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void reenviarFalhas(item)}
                          disabled={reenviandoId !== null}
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCw className={`h-4 w-4 ${reenviandoId === item.id ? "animate-spin" : ""}`} />
                          {reenviandoId === item.id ? "Reenviando..." : "Reenviar falhas"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
