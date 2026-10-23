"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarX, RefreshCw, SquarePen } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";

type JogoSemPlacar = {
  id: string;
  fase: string;
  status: "AGENDADA" | "EM_ANDAMENTO";
  quadra: string | null;
  data: string | null;
  dataEhLimite: boolean;
  equipeA: string;
  equipeB: string;
  placarPendente: boolean;
  torneio: { id: string; nome: string; slug: string; superCampeonato: boolean };
  categoria: { id: string; nome: string };
};

const FASE_LABEL: Record<string, string> = {
  GRUPOS: "Grupos",
  OITAVAS: "Oitavas",
  QUARTAS: "Quartas",
  SEMI: "Semifinal",
  FINAL: "Final",
  TERCEIRO_LUGAR: "3º lugar",
};

function formatarData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function diasAtras(iso: string | null) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

export default function JogosSemPlacarPage() {
  const [jogos, setJogos] = useState<JogoSemPlacar[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [torneioId, setTorneioId] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/v1/admin/jogos-sem-placar", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Não foi possível carregar os jogos");
      setJogos(data.jogos);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const torneiosLista = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jogos ?? []) m.set(j.torneio.id, j.torneio.nome);
    return Array.from(m, ([id, nome]) => ({ id, nome }));
  }, [jogos]);

  // torneio > categoria > jogos
  const grupos = useMemo(() => {
    const lista = (jogos ?? []).filter((j) => !torneioId || j.torneio.id === torneioId);
    const porTorneio = new Map<string, { torneio: JogoSemPlacar["torneio"]; categorias: Map<string, { nome: string; jogos: JogoSemPlacar[] }> }>();
    for (const j of lista) {
      const t = porTorneio.get(j.torneio.id) ?? { torneio: j.torneio, categorias: new Map() };
      const c = t.categorias.get(j.categoria.id) ?? { nome: j.categoria.nome, jogos: [] };
      c.jogos.push(j);
      t.categorias.set(j.categoria.id, c);
      porTorneio.set(j.torneio.id, t);
    }
    return Array.from(porTorneio.values());
  }, [jogos, torneioId]);

  const total = grupos.reduce((s, t) => s + Array.from(t.categorias.values()).reduce((x, c) => x + c.jogos.length, 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Play na Quadra"
        title="Jogos sem placar"
        description="Jogos com a data já passada que ainda não têm resultado. Sem horário marcado, vale a data limite."
        actions={
          <Button variant="ghost" disabled={carregando} onClick={() => void carregar()} icon={<RefreshCw className={carregando ? "animate-spin" : ""} />}>
            Atualizar
          </Button>
        }
      />

      {erro && <Alert>{erro}</Alert>}

      {jogos && torneiosLista.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-[10px] border border-line bg-white px-3 text-sm font-semibold text-ink"
            value={torneioId}
            onChange={(e) => setTorneioId(e.target.value)}
          >
            <option value="">Todos os torneios</option>
            {torneiosLista.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <span className="text-sm font-semibold text-muted">
            {total} {total === 1 ? "jogo" : "jogos"}
          </span>
        </div>
      )}

      {!jogos && !erro && <p className="text-sm text-muted">Carregando…</p>}

      {jogos && total === 0 && (
        <EmptyState icon={<CalendarX />} title="Nenhum jogo atrasado" description="Todos os jogos com data passada já têm placar." />
      )}

      {grupos.map((t) => (
        <section key={t.torneio.id} className="space-y-3">
          <h2 className="text-base font-extrabold text-ink">{t.torneio.nome}</h2>
          {Array.from(t.categorias, ([categoriaId, c]) => (
            <Card key={categoriaId} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5 sm:px-5">
                <span className="font-extrabold text-ink">{c.nome}</span>
                <span className="text-xs font-semibold tabular-nums text-muted">
                  {c.jogos.length} {c.jogos.length === 1 ? "jogo" : "jogos"}
                </span>
              </div>
              <ul className="divide-y divide-sand-2">
                {c.jogos.map((j) => (
                  <li key={j.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
                        <span className="tabular-nums text-ink-2">
                          {j.dataEhLimite ? "Limite " : ""}
                          {formatarData(j.data)}
                        </span>
                        <span>· {diasAtras(j.data)}</span>
                        <Badge tone="neutral">{FASE_LABEL[j.fase] ?? j.fase}</Badge>
                        {j.quadra && <span>· {j.quadra}</span>}
                        {j.status === "EM_ANDAMENTO" && <Badge tone="live">Em andamento</Badge>}
                        {j.placarPendente && <Badge tone="warning">Placar aguardando confirmação</Badge>}
                      </div>
                      <div className="text-sm font-bold text-ink">
                        {j.equipeA} <span className="font-semibold text-muted">x</span> {j.equipeB}
                      </div>
                    </div>
                    <LinkButton
                      variant="dark"
                      size="sm"
                      icon={<SquarePen />}
                      className="shrink-0"
                      href={`/admin/torneios/${j.torneio.slug}/categorias/${j.categoria.id}/jogos${j.torneio.superCampeonato ? "/super" : ""}?partidaId=${j.id}&fase=${j.fase}`}
                    >
                      Lançar placar
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}
