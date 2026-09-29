"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MoreHorizontal, Plus, Search, Settings2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Menu,
  PageHeader,
  TORNEIO_STATUS,
  TorneioStatusBadge,
  type TorneioStatus,
} from "@/components/admin/ui";
import { TorneioDestaque, TorneioMiniatura, periodoTorneio } from "@/components/admin/torneio-destaque";

type TorneioListItem = {
  id: string;
  nome: string;
  slug: string;
  dataInicio: string;
  dataFim: string;
  local: string;
  status: TorneioStatus;
  bannerUrl: string | null;
  logoUrl?: string | null;
  esporteNome: string | null;
};

type Filtro = "TODOS" | TorneioStatus;

const ORDEM_STATUS: Record<TorneioStatus, number> = { EM_ANDAMENTO: 0, ABERTO: 1, RASCUNHO: 2, FINALIZADO: 3, CANCELADO: 4 };

function tempo(v: string | null | undefined) {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export default function AdminTorneiosPage() {
  const [torneios, setTorneios] = useState<TorneioListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("TODOS");

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const res = await fetch("/api/v1/torneios?limit=200", { cache: "no-store" });
        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Falha ao carregar torneios");
        }
        const dados = (await res.json()) as TorneioListItem[];
        if (ativo) setTorneios(dados);
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro inesperado");
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { TODOS: torneios.length };
    for (const t of torneios) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [torneios]);

  const ordenados = useMemo(() => {
    return [...torneios].sort((a, b) => {
      const s = (ORDEM_STATUS[a.status] ?? 9) - (ORDEM_STATUS[b.status] ?? 9);
      if (s !== 0) return s;
      // encerrados: mais recentes primeiro; demais: mais proximos primeiro
      const encerrado = a.status === "FINALIZADO" || a.status === "CANCELADO";
      return encerrado ? tempo(b.dataInicio) - tempo(a.dataInicio) : tempo(a.dataInicio) - tempo(b.dataInicio);
    });
  }, [torneios]);

  const torneiosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ordenados.filter((t) => {
      if (filtro !== "TODOS" && t.status !== filtro) return false;
      if (!q) return true;
      const alvo = `${t.nome} ${t.slug} ${t.local} ${t.esporteNome ?? ""} ${TORNEIO_STATUS[t.status]?.label ?? t.status}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [ordenados, busca, filtro]);

  const aoVivo = useMemo(() => torneios.filter((t) => t.status === "EM_ANDAMENTO"), [torneios]);

  const filtros: Array<{ id: Filtro; label: string }> = [
    { id: "TODOS", label: "Todos" },
    { id: "EM_ANDAMENTO", label: "Em andamento" },
    { id: "ABERTO", label: "Inscrições abertas" },
    { id: "RASCUNHO", label: "Rascunho" },
    { id: "FINALIZADO", label: "Finalizados" },
    { id: "CANCELADO", label: "Cancelados" },
  ];

  function acoes(t: TorneioListItem) {
    return (
      <Menu
        items={[
          { label: "Editar dados", icon: <Settings2 />, href: `/admin/torneios/${t.slug}/editar` },
          { label: "Página pública", icon: <ExternalLink />, href: `/torneios/${t.slug}`, external: true },
        ]}
        trigger={({ toggle }) => (
          <Button variant="ghost" size="sm" onClick={toggle} aria-label={`Mais ações de ${t.nome}`} className="w-9 px-0">
            <MoreHorizontal />
          </Button>
        )}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Torneios"
        description={
          carregando
            ? "Carregando…"
            : `${torneios.length} evento(s)${aoVivo.length ? ` · ${aoVivo.length} acontecendo agora` : ""}`
        }
        actions={
          <LinkButton href="/admin/torneios/novo" variant="primary" icon={<Plus />}>
            Novo torneio
          </LinkButton>
        }
      />

      {erro && <Alert>{erro}</Alert>}

      {aoVivo.length > 0 && filtro === "TODOS" && !busca && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {aoVivo.map((t) => (
            <TorneioDestaque key={t.id} torneio={t} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {filtros
            .filter((f) => f.id === "TODOS" || (contagem[f.id] ?? 0) > 0)
            .map((f) => {
              const ativo = filtro === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  aria-pressed={ativo}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                    ativo ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-[#d3cfc7]",
                  )}
                >
                  {f.label}
                  <b className={ativo ? "text-white" : "text-ink"}>{contagem[f.id] ?? 0}</b>
                </button>
              );
            })}
        </div>
        <label className="flex h-10 w-full items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 text-muted focus-within:border-[#d3cfc7] lg:w-80">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por nome, local, esporte…"
            aria-label="Filtrar torneios"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
      </div>

      <Card className="overflow-hidden">
        {carregando ? (
          <div className="space-y-px">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 border-b border-sand-2 px-5 py-4">
                <div className="h-11 w-12 animate-pulse rounded-lg bg-sand-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 animate-pulse rounded bg-sand-2" />
                  <div className="h-3 w-1/4 animate-pulse rounded bg-sand-2" />
                </div>
              </div>
            ))}
          </div>
        ) : torneiosFiltrados.length === 0 ? (
          <EmptyState
            icon={<Trophy />}
            title={torneios.length === 0 ? "Nenhum torneio ainda" : "Nenhum torneio encontrado"}
            description={torneios.length === 0 ? "Crie o primeiro evento para começar." : "Ajuste o filtro ou a busca."}
            action={
              torneios.length === 0 ? (
                <LinkButton href="/admin/torneios/novo" variant="primary" icon={<Plus />}>
                  Novo torneio
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* celular: lista em cartoes */}
            <ul className="md:hidden">
              {torneiosFiltrados.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b border-sand-2 px-4 py-3 last:border-b-0">
                  <Link href={`/admin/torneios/${t.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <TorneioMiniatura torneio={t} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-extrabold text-ink">{t.nome}</div>
                      <div className="truncate text-xs text-muted">{periodoTorneio(t)}</div>
                      <TorneioStatusBadge status={t.status} className="mt-1.5" />
                    </div>
                  </Link>
                  {acoes(t)}
                </li>
              ))}
            </ul>

            {/* desktop: tabela */}
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-paper">
                <tr className="text-left text-xs font-bold text-muted">
                  <th className="border-b border-line px-5 py-3">Torneio</th>
                  <th className="border-b border-line px-4 py-3">Datas</th>
                  <th className="border-b border-line px-4 py-3">Esporte</th>
                  <th className="border-b border-line px-4 py-3">Status</th>
                  <th className="border-b border-line px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {torneiosFiltrados.map((t) => (
                  <tr key={t.id} className="group border-b border-sand-2 last:border-b-0 hover:bg-paper">
                    <td className="px-5 py-3">
                      <Link href={`/admin/torneios/${t.slug}`} className="flex items-center gap-3">
                        <TorneioMiniatura torneio={t} className="h-11 w-12" />
                        <span className="min-w-0">
                          <span className="block truncate font-extrabold text-ink group-hover:underline group-hover:underline-offset-4">
                            {t.nome}
                          </span>
                          <span className="block truncate text-xs text-muted">{t.local || "Local a definir"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-2">{periodoTorneio(t)}</td>
                    <td className="px-4 py-3 text-ink-2">{t.esporteNome ?? "—"}</td>
                    <td className="px-4 py-3">
                      <TorneioStatusBadge status={t.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <LinkButton href={`/admin/torneios/${t.slug}`} size="sm">
                          {t.status === "RASCUNHO" ? "Continuar" : "Abrir"}
                        </LinkButton>
                        {acoes(t)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}
