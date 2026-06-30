"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, RefreshCw, Save, Users } from "lucide-react";

type AtletaInscrito = {
  atletaId: string;
  atletaNome: string;
  atletaEmail: string;
  atletaTelefone: string | null;
  atletaCamiseta: string | null;
  equipeId: string;
  equipeNome: string | null;
  inscricaoId: string;
  inscricaoStatus: string;
  pago: boolean;
};

type CategoriaInscritos = {
  categoriaId: string;
  categoriaNome: string;
  categoriaGenero: string;
  categoriaDataHorario?: string | null;
  atletas: AtletaInscrito[];
};

type ApiResponse = {
  torneio: { id: string; nome: string; slug: string; camisetaOpcoes?: string[] };
  categorias: CategoriaInscritos[];
};

type GradeCamisetaRow = {
  tipo: string;
  tamanho: string;
  quantidade: number;
};

function normalizeSheetName(value: string) {
  const name = (value || "Categoria").replaceAll(/[\\/?*[\]:]/g, " ").trim();
  return name.length > 31 ? name.slice(0, 31) : name;
}

function normalizeCamisetaValue(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function parseCamisetaGrade(value?: string | null) {
  const normalized = normalizeCamisetaValue(value);
  if (!normalized) return null;

  const tokens = normalized.split(" ").filter(Boolean);
  const lastToken = tokens[tokens.length - 1]?.toUpperCase() || "";
  const tamanhos = new Set(["PP", "P", "M", "G", "GG", "XG", "XGG", "EG", "EXG", "EXGG", "UNICO", "UNICA", "U"]);

  if (tokens.length === 1) {
    return {
      tipo: "Nao informado",
      tamanho: tokens[0].toUpperCase(),
    };
  }

  if (tamanhos.has(lastToken)) {
    const tipo = tokens.slice(0, -1).join(" ").trim() || "Nao informado";
    return {
      tipo,
      tamanho: lastToken === "U" ? "UNICO" : lastToken,
    };
  }

  return {
    tipo: normalized,
    tamanho: "Nao informado",
  };
}

function resolveCamisetaTela(params: {
  torneioCamisetaOpcoes?: string[];
  valorEditado?: string | null;
  valorOriginal?: string | null;
}) {
  const opcoes = Array.isArray(params.torneioCamisetaOpcoes) ? params.torneioCamisetaOpcoes.map((item) => normalizeCamisetaValue(item)) : [];
  const valorEditado = normalizeCamisetaValue(params.valorEditado);
  const valorOriginal = normalizeCamisetaValue(params.valorOriginal);

  if (opcoes.length === 0) {
    return valorEditado || valorOriginal || "";
  }

  const valorSelecionado = valorEditado || valorOriginal;
  if (!valorSelecionado) return "";

  const match = opcoes.find((opcao) => opcao.toLowerCase() === valorSelecionado.toLowerCase());
  return match || "";
}

export default function AdminAtletasInscritosPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [camisetasEditadas, setCamisetasEditadas] = useState<Record<string, string>>({});
  const [salvandoAtletaId, setSalvandoAtletaId] = useState<string | null>(null);
  const [erroCamiseta, setErroCamiseta] = useState<string | null>(null);

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/atletas-inscritos`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar inscritos");
      setData(payload as ApiResponse);
      const iniciais = Object.fromEntries(
        ((payload as ApiResponse)?.categorias || [])
          .flatMap((categoria) => categoria.atletas)
          .map((atleta) => [atleta.atletaId, atleta.atletaCamiseta || ""])
      );
      setCamisetasEditadas(iniciais);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar inscritos");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [slug]);

  const totalAtletas = useMemo(() => (data?.categorias || []).reduce((acc, c) => acc + (c.atletas?.length || 0), 0), [data]);
  const totalDuplas = useMemo(
    () =>
      (data?.categorias || []).reduce((acc, c) => {
        return acc + new Set(c.atletas.map((a) => a.equipeId)).size;
      }, 0),
    [data]
  );
  const gradeCamisetas = useMemo<GradeCamisetaRow[]>(() => {
    const counts = new Map<string, GradeCamisetaRow>();

    for (const categoria of data?.categorias || []) {
      for (const atleta of categoria.atletas) {
        const camisetaTela = resolveCamisetaTela({
          torneioCamisetaOpcoes: data?.torneio?.camisetaOpcoes,
          valorEditado: camisetasEditadas[atleta.atletaId],
          valorOriginal: atleta.atletaCamiseta,
        });
        const parsed = parseCamisetaGrade(camisetaTela);
        if (!parsed) continue;
        const key = `${parsed.tipo}|||${parsed.tamanho}`;
        const current = counts.get(key);
        if (current) {
          current.quantidade += 1;
        } else {
          counts.set(key, { ...parsed, quantidade: 1 });
        }
      }
    }

    return Array.from(counts.values()).sort((a, b) => {
      const tipo = a.tipo.localeCompare(b.tipo);
      if (tipo !== 0) return tipo;
      return a.tamanho.localeCompare(b.tamanho);
    });
  }, [camisetasEditadas, data]);

  async function exportarExcel() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const linhasGerais = data.categorias.flatMap((c) =>
      c.atletas.map((a) => ({
        Categoria: c.categoriaNome,
        Nome: a.atletaNome,
        Dupla: a.equipeNome || "",
        Telefone: a.atletaTelefone || "",
        Camiseta: resolveCamisetaTela({
          torneioCamisetaOpcoes: data?.torneio?.camisetaOpcoes,
          valorEditado: camisetasEditadas[a.atletaId],
          valorOriginal: a.atletaCamiseta,
        }),
      }))
    );

    const wsGeral = XLSX.utils.json_to_sheet(linhasGerais);
    XLSX.utils.book_append_sheet(wb, wsGeral, "Inscritos");

    if (gradeCamisetas.length > 0) {
      const wsGrade = XLSX.utils.json_to_sheet(
        gradeCamisetas.map((item) => ({
          Tipo: item.tipo,
          Tamanho: item.tamanho,
          Quantidade: item.quantidade,
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsGrade, "Grade Camisetas");
    }

    for (const c of data.categorias) {
      const linhas = c.atletas.map((a) => ({
        Nome: a.atletaNome,
        Dupla: a.equipeNome || "",
        Telefone: a.atletaTelefone || "",
        Camiseta: resolveCamisetaTela({
          torneioCamisetaOpcoes: data?.torneio?.camisetaOpcoes,
          valorEditado: camisetasEditadas[a.atletaId],
          valorOriginal: a.atletaCamiseta,
        }),
      }));
      const ws = XLSX.utils.json_to_sheet(linhas);
      XLSX.utils.book_append_sheet(wb, ws, normalizeSheetName(c.categoriaNome));
    }

    const fileName = `relacao-inscritos-${data.torneio.slug}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  async function salvarCamiseta(atletaId: string) {
    if (!data) return;
    try {
      setErroCamiseta(null);
      setSalvandoAtletaId(atletaId);
      const res = await fetch(`/api/v1/torneios/${slug}/atletas-inscritos/${atletaId}/camiseta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camisetaOpcao: camisetasEditadas[atletaId] ?? "" }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao atualizar camiseta");

      const camisetaSalva = typeof payload?.camisetaOpcao === "string" ? payload.camisetaOpcao : "";
      setCamisetasEditadas((prev) => ({ ...prev, [atletaId]: camisetaSalva }));
      setData((prev) =>
        prev
          ? {
              ...prev,
              categorias: prev.categorias.map((categoria) => ({
                ...categoria,
                atletas: categoria.atletas.map((atleta) =>
                  atleta.atletaId === atletaId ? { ...atleta, atletaCamiseta: camisetaSalva || null } : atleta
                ),
              })),
            }
          : prev
      );
    } catch (e: any) {
      setErroCamiseta(e?.message || "Falha ao atualizar camiseta");
    } finally {
      setSalvandoAtletaId(null);
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
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Relação de inscritos</h1>
          <p className="text-sm text-slate-600">
            {data?.torneio?.nome || "Torneio"} • {totalAtletas} atleta(s) • {totalDuplas} dupla(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarExcel}
            disabled={!data || carregando || totalAtletas === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>
          <button
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-red-600">{erro}</div>}
      {erroCamiseta && <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4 text-amber-700">{erroCamiseta}</div>}

      {carregando && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-slate-600">Carregando…</div>
      )}

      {!carregando && data && data.categorias.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center text-slate-600">
          <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          Nenhum inscrito encontrado.
        </div>
      )}

      {!carregando && data && data.categorias.length > 0 && (
        <div className="space-y-6">
          {data.categorias.map((c) => {
            const totalDuplasCategoria = new Set(c.atletas.map((a) => a.equipeId)).size;

            return (
            <div key={c.categoriaId} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">{c.categoriaNome}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {totalDuplasCategoria} dupla(s) • {c.atletas.length} atleta(s)
                  </div>
                </div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {c.categoriaGenero}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-left text-slate-500">
                      <th className="py-3 px-4 font-medium">Nome</th>
                      <th className="py-3 px-4 font-medium">Dupla</th>
                      <th className="py-3 px-4 font-medium">Telefone</th>
                      <th className="py-3 px-4 font-medium">Camiseta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.atletas.map((a) => (
                      <tr key={`${c.categoriaId}:${a.atletaId}:${a.inscricaoId}`} className="border-b border-slate-100">
                        <td className="py-3 px-4 font-semibold text-slate-900">{a.atletaNome}</td>
                        <td className="py-3 px-4 text-slate-700">{a.equipeNome || "-"}</td>
                        <td className="py-3 px-4 text-slate-700">{a.atletaTelefone || "-"}</td>
                        <td className="py-3 px-4 text-slate-700">
                          <div className="flex min-w-[220px] items-center gap-2">
                            {(data?.torneio?.camisetaOpcoes || []).length > 0 ? (
                              <select
                                value={camisetasEditadas[a.atletaId] ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setCamisetasEditadas((prev) => ({ ...prev, [a.atletaId]: value }));
                                }}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                              >
                                <option value="">Sem informar</option>
                                {(data?.torneio?.camisetaOpcoes || []).map((opcao) => (
                                  <option key={opcao} value={opcao}>
                                    {opcao}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={camisetasEditadas[a.atletaId] ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setCamisetasEditadas((prev) => ({ ...prev, [a.atletaId]: value }));
                                }}
                                placeholder="Informar camiseta"
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => salvarCamiseta(a.atletaId)}
                              disabled={salvandoAtletaId === a.atletaId}
                              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              {salvandoAtletaId === a.atletaId ? "Salvando" : "Salvar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {c.atletas.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          Nenhum inscrito nesta categoria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )})}

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="font-bold text-slate-900">Grade de camisetas</div>
              <div className="text-xs text-slate-500 mt-1">Resumo final por tipo e tamanho</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-left text-slate-500">
                    <th className="py-3 px-4 font-medium">Tipo</th>
                    <th className="py-3 px-4 font-medium">Tamanho</th>
                    <th className="py-3 px-4 font-medium">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeCamisetas.map((item) => (
                    <tr key={`${item.tipo}:${item.tamanho}`} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-slate-900 font-semibold">{item.tipo}</td>
                      <td className="py-3 px-4 text-slate-700">{item.tamanho}</td>
                      <td className="py-3 px-4 text-slate-700">{item.quantidade}</td>
                    </tr>
                  ))}
                  {gradeCamisetas.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-500">
                        Nenhuma camiseta informada para montar a grade.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
