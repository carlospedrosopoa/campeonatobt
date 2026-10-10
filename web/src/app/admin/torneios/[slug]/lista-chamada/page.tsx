"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, Check, RefreshCw, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from "@/components/admin/ui";

type AtletaChamada = {
  usuarioId: string;
  nome: string;
  fotoUrl: string | null;
  presente: boolean;
  origem: string | null;
  registradoEm: string | null;
};

type DuplaChamada = { equipeId: string; nome: string; primeiroJogo: string | null; atletas: AtletaChamada[] };
type CategoriaChamada = { id: string; nome: string; duplas: DuplaChamada[] };
type ListaChamada = { data: string; resumo: { total: number; presentes: number }; categorias: CategoriaChamada[] };

const ORIGEM: Record<string, string> = {
  QR: "QR da entrada",
  APP: "app",
  PARCEIRO: "informado pelo parceiro",
  ARBITRO: "árbitro",
  ADMIN: "organização",
  WHATSAPP: "WhatsApp",
};

function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function hora(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function ListaChamadaPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState(hojeSP);
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [lista, setLista] = useState<ListaChamada | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soFaltando, setSoFaltando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/presencas?data=${data}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao carregar a lista de chamada");
      setLista(payload as ListaChamada);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }, [slug, data]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternar(a: AtletaChamada) {
    const novo = !a.presente;
    try {
      setSalvando(a.usuarioId);
      setErro(null);
      const res = await fetch(`/api/v1/torneios/${slug}/presencas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: a.usuarioId, data, presente: novo }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || "Falha ao registrar presença");
      // o mesmo atleta pode estar em mais de uma categoria: atualiza todas as ocorrencias
      setLista((l) => {
        if (!l) return l;
        const categorias = l.categorias.map((c) => ({
          ...c,
          duplas: c.duplas.map((d) => ({
            ...d,
            atletas: d.atletas.map((x) =>
              x.usuarioId === a.usuarioId
                ? { ...x, presente: novo, origem: novo ? payload?.origem ?? "ARBITRO" : null, registradoEm: novo ? payload?.registradoEm ?? null : null }
                : x,
            ),
          })),
        }));
        const unicos = new Map<string, boolean>();
        for (const c of categorias) for (const d of c.duplas) for (const x of d.atletas) unicos.set(x.usuarioId, x.presente);
        const presentes = Array.from(unicos.values()).filter(Boolean).length;
        return { ...l, categorias, resumo: { total: unicos.size, presentes } };
      });
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvando(null);
    }
  }

  const categoriasVisiveis = useMemo(() => {
    if (!lista) return [];
    const q = busca.trim().toLowerCase();
    return lista.categorias
      .filter((c) => !categoriaId || c.id === categoriaId)
      .map((c) => ({
        ...c,
        duplas: c.duplas.filter((d) => {
          if (soFaltando && d.atletas.every((a) => a.presente)) return false;
          if (!q) return true;
          return d.atletas.some((a) => a.nome.toLowerCase().includes(q)) || d.nome.toLowerCase().includes(q);
        }),
      }))
      .filter((c) => c.duplas.length > 0);
  }, [lista, categoriaId, busca, soFaltando]);

  const total = lista?.resumo.total ?? 0;
  const presentes = lista?.resumo.presentes ?? 0;
  const pct = total ? Math.round((presentes / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lista de chamada"
        description="Marque quem já chegou. O check-in vale para todos os jogos do atleta no dia."
        actions={
          <>
            <label className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d9d5cc] bg-white px-3 text-sm">
              <Calendar className="h-4 w-4 text-muted" />
              <input type="date" value={data} onChange={(e) => setData(e.target.value || hojeSP())} aria-label="Dia" className="bg-transparent text-ink outline-none" />
            </label>
            <Button onClick={() => void carregar()} disabled={carregando} aria-label="Atualizar" className="w-10 px-0">
              <RefreshCw className={carregando ? "animate-spin" : ""} />
            </Button>
          </>
        }
      />

      {erro && <Alert>{erro}</Alert>}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-bold leading-none tabular-nums text-ink">{presentes}</span>
          <span className="font-display text-2xl font-bold text-muted">/ {total}</span>
          <span className="ml-1 text-sm font-semibold text-ink-2">atletas presentes</span>
        </div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-2">
          <div className="h-2 rounded-full bg-[#1e7f4f] transition-all" style={{ width: `${pct}%` }} />
        </div>
        {total - presentes > 0 && <Badge tone="warning">Faltam {total - presentes}</Badge>}
      </Card>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {[{ id: "", nome: "Todas" }, ...(lista?.categorias ?? []).map((c) => ({ id: c.id, nome: c.nome }))].map((c) => {
            const on = categoriaId === c.id;
            return (
              <button
                key={c.id || "todas"}
                type="button"
                aria-pressed={on}
                onClick={() => setCategoriaId(c.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold",
                  on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-[#d3cfc7]",
                )}
              >
                {c.nome}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-3 text-muted lg:w-64 lg:flex-none">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar atleta"
              aria-label="Buscar atleta"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </label>
          <Button variant={soFaltando ? "dark" : "secondary"} onClick={() => setSoFaltando((v) => !v)} aria-pressed={soFaltando}>
            Só quem falta
          </Button>
        </div>
      </div>

      {carregando && !lista ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-[14px] border border-line bg-white" />
          ))}
        </div>
      ) : categoriasVisiveis.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={total === 0 ? "Nenhuma inscrição aprovada" : soFaltando ? "Todo mundo já chegou" : "Ninguém encontrado"}
            description={total === 0 ? "A lista de chamada usa as inscrições aprovadas das categorias." : undefined}
          />
        </Card>
      ) : (
        categoriasVisiveis.map((c) => (
          <section key={c.id} className="space-y-3">
            <h2 className="text-base font-extrabold text-ink">{c.nome}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {c.duplas.map((d) => {
                const n = d.atletas.filter((a) => a.presente).length;
                const pronta = d.atletas.length > 0 && n === d.atletas.length;
                return (
                  <Card key={d.equipeId} className="overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-sand-2 bg-paper px-4 py-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">
                        {hora(d.primeiroJogo) ? `1º jogo ${hora(d.primeiroJogo)}` : "Sem jogo neste dia"}
                      </span>
                      <Badge tone={pronta ? "success" : n > 0 ? "warning" : "neutral"}>
                        {pronta ? (d.atletas.length > 1 ? "Dupla pronta" : "Pronto") : n > 0 ? `Falta ${d.atletas.length - n}` : "Ninguém chegou"}
                      </Badge>
                    </div>
                    {d.atletas.map((a) => (
                      <div key={a.usuarioId} className="flex items-center gap-3 border-t border-sand-2 px-4 py-2.5 first:border-t-0">
                        {a.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.fotoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0b3a52] text-[13px] font-extrabold text-white">
                            {iniciais(a.nome)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-extrabold text-ink">{a.nome}</div>
                          <div className={cn("truncate text-xs font-semibold", a.presente ? "text-[#17663f]" : "text-[#8a4e00]")}>
                            {a.presente
                              ? `Chegou${a.registradoEm ? ` ${hora(a.registradoEm)}` : ""}${a.origem && ORIGEM[a.origem] ? ` · ${ORIGEM[a.origem]}` : ""}`
                              : "Ainda não chegou"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void alternar(a)}
                          disabled={salvando === a.usuarioId}
                          aria-pressed={a.presente}
                          aria-label={`${a.presente ? "Desmarcar" : "Marcar"} presença de ${a.nome}`}
                          className={cn(
                            "inline-flex h-10 min-w-[108px] items-center justify-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-extrabold disabled:opacity-60",
                            a.presente ? "border-[#1e7f4f] bg-[#1e7f4f] text-white" : "border-[#d9d5cc] bg-white text-ink hover:bg-sand",
                          )}
                        >
                          {a.presente ? (
                            <>
                              <Check className="h-4 w-4" /> Presente
                            </>
                          ) : (
                            "Marcar"
                          )}
                        </button>
                      </div>
                    ))}
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
