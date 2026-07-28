"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, DollarSign, RefreshCw } from "lucide-react";

type CobrancaItem = {
  inscricaoId: string;
  inscricaoStatus: string;
  categoriaId: string;
  categoriaNome: string;
  categoriaGenero: string;
  valor: string;
  pago: boolean;
  pagamentoStatus: string | null;
};

type CobrancaAtleta = {
  atletaId: string;
  nome: string;
  email: string;
  telefone: string | null;
  total: string;
  totalPendente: string;
  itens: CobrancaItem[];
};

type ApiResponse = {
  torneio: { id: string; nome: string; slug: string };
  atletas: CobrancaAtleta[];
};

function formatCurrency(value?: string | null) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function AdminCobrancaInscricoesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [valorMinimoPendente, setValorMinimoPendente] = useState("");
  const [somenteMultiplasInscricoes, setSomenteMultiplasInscricoes] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [salvandoChave, setSalvandoChave] = useState<string | null>(null);

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/cobranca`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar cobrança");
      setData(payload as ApiResponse);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar cobrança");
      setData(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [slug]);

  async function setAtletaPago(params: { inscricaoId: string; atletaId: string; pago: boolean }) {
    const key = `${params.inscricaoId}:${params.atletaId}`;
    try {
      setSalvandoChave(key);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/inscricoes/${params.inscricaoId}/pagamentos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atletaId: params.atletaId, pago: params.pago }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao salvar pagamento");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar pagamento");
    } finally {
      setSalvandoChave(null);
    }
  }

  async function marcarPendenciasComoPagas(atleta: CobrancaAtleta) {
    const pendentes = atleta.itens.filter((item) => !item.pago);
    if (pendentes.length === 0) return;

    const ok = window.confirm(`Marcar como pago as ${pendentes.length} pendências de ${atleta.nome}?`);
    if (!ok) return;

    try {
      setErro(null);
      setSalvandoChave(`bulk:${atleta.atletaId}`);
      await Promise.all(
        pendentes.map((item) =>
          fetch(`/api/v1/torneios/${slug}/inscricoes/${item.inscricaoId}/pagamentos`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ atletaId: atleta.atletaId, pago: true }),
          }).then(async (res) => {
            if (res.ok) return;
            const payload = (await res.json().catch(() => null)) as any;
            throw new Error(payload?.error || "Falha ao salvar pagamento");
          })
        )
      );
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar pagamentos");
    } finally {
      setSalvandoChave(null);
    }
  }

  const atletasFiltrados = useMemo(() => {
    const query = normalizeText(busca);
    const valorMinimo = Number(
      valorMinimoPendente
        .trim()
        .replace(/\s+/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^0-9.]/g, "")
    );
    const atletas = data?.atletas || [];

    return atletas.filter((a) => {
      const blob = normalizeText(`${a.nome} ${a.email} ${a.telefone || ""}`);
      const matchBusca = !query || blob.includes(query);
      const totalPendenteAtleta = Number(a.totalPendente || 0);
      const matchValor = !valorMinimoPendente.trim() || (Number.isFinite(valorMinimo) && totalPendenteAtleta >= valorMinimo);
      const matchMultiplas = !somenteMultiplasInscricoes || a.itens.length > 1;

      return matchBusca && matchValor && matchMultiplas;
    });
  }, [busca, data, somenteMultiplasInscricoes, valorMinimoPendente]);

  const totalAtletas = data?.atletas?.length ?? 0;
  const totalPendente = useMemo(() => {
    const sum = (data?.atletas || []).reduce((acc, a) => acc + Number(a.totalPendente || 0), 0);
    return sum.toFixed(2);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href={`/admin/torneios/${slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Cobrança de inscrições</h1>
          <p className="text-sm text-slate-600">
            {data?.torneio?.nome ? `${data.torneio.nome} • ` : ""}
            {totalAtletas} atletas • pendente total {formatCurrency(totalPendente)}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:w-auto">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            Extrato por atleta
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, email ou telefone"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
            />
            <input
              value={valorMinimoPendente}
              onChange={(e) => setValorMinimoPendente(e.target.value)}
              placeholder="Pendente a partir de R$"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
            />
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={somenteMultiplasInscricoes}
                onChange={(e) => setSomenteMultiplasInscricoes(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              Mais de uma inscrição
            </label>
          </div>
        </div>
      </div>

      {carregando ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Carregando…</div>
      ) : !data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Sem dados.</div>
      ) : atletasFiltrados.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Nenhum atleta encontrado.</div>
      ) : (
        <div className="space-y-4">
          {atletasFiltrados.map((atleta) => {
            const aberto = Boolean(expandido[atleta.atletaId]);
            const pendente = Number(atleta.totalPendente || 0) > 0;
            const bulkKey = `bulk:${atleta.atletaId}`;

            return (
              <div key={atleta.atletaId} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-bold text-slate-900">{atleta.nome}</div>
                      {pendente ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          Pendente {formatCurrency(atleta.totalPendente)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          Em dia
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        Total {formatCurrency(atleta.total)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {atleta.email}
                      {atleta.telefone ? <span> • {atleta.telefone}</span> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandido((prev) => ({ ...prev, [atleta.atletaId]: !aberto }))}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {aberto ? "Ocultar detalhes" : "Ver detalhes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void marcarPendenciasComoPagas(atleta)}
                        disabled={!pendente || salvandoChave === bulkKey}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {salvandoChave === bulkKey ? "Salvando..." : "Marcar pendências como pagas"}
                      </button>
                    </div>
                  </div>
                </div>

                {aberto ? (
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                            <th className="py-2 pr-3">Categoria</th>
                            <th className="py-2 pr-3">Valor</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 pr-3">Ajustes</th>
                            <th className="py-2 pr-3 text-right">Pago</th>
                          </tr>
                        </thead>
                        <tbody>
                          {atleta.itens.map((item, idx) => {
                            const key = `${item.inscricaoId}:${atleta.atletaId}`;
                            const rowClass = idx % 2 === 0 ? "bg-white" : "bg-violet-50/40";
                            return (
                              <tr key={key} className={rowClass}>
                                <td className="py-3 pr-3 font-semibold text-slate-900">
                                  {item.categoriaNome} <span className="font-normal text-slate-500">({item.categoriaGenero})</span>
                                </td>
                                <td className="py-3 pr-3 text-slate-800">{formatCurrency(item.valor)}</td>
                                <td className="py-3 pr-3">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                    {item.inscricaoStatus}
                                  </span>
                                </td>
                                <td className="py-3 pr-3">
                                  <Link
                                    href={`/admin/torneios/${slug}/categorias/${item.categoriaId}/inscricoes?editar=${encodeURIComponent(
                                      item.inscricaoId
                                    )}`}
                                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                  >
                                    Editar inscrição
                                  </Link>
                                </td>
                                <td className="py-3 pr-3 text-right">
                                  <label className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={item.pago}
                                      disabled={salvandoChave === key}
                                      onChange={(e) =>
                                        void setAtletaPago({
                                          inscricaoId: item.inscricaoId,
                                          atletaId: atleta.atletaId,
                                          pago: e.target.checked,
                                        })
                                      }
                                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                                    />
                                    <span className="text-xs font-semibold text-slate-600">
                                      {salvandoChave === key ? "Salvando..." : item.pago ? "Sim" : "Não"}
                                    </span>
                                  </label>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
