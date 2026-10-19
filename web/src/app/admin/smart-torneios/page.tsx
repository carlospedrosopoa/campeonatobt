"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";
import type { ResumoSmart, StatusSmart } from "@/services/smart-torneio.service";

const ABAS: { status: StatusSmart; rotulo: string }[] = [
  { status: "AGUARDANDO_APROVACAO", rotulo: "Aguardando aprovação" },
  { status: "AGUARDANDO_PAGAMENTO", rotulo: "Aguardando pagamento" },
  { status: "APROVADO", rotulo: "Autorizados" },
  { status: "RECUSADO", rotulo: "Recusados" },
];

const GENERO: Record<string, string> = { MASCULINO: "Masculina", FEMININO: "Feminina", MISTO: "Mista", LIVRE: "Livre" };
const moeda = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBR = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

type Config = { valorPorAtleta: number; valorMinimo: number; pixChave: string | null; pixNome: string | null; pixCidade: string | null };

/** Gestor do Play na Quadra: confere o Pix e autoriza ou recusa os Smart Torneios; preco e chave Pix. */
export default function SmartTorneiosAdminPage() {
  const [aba, setAba] = useState<StatusSmart>("AGUARDANDO_APROVACAO");
  const [lista, setLista] = useState<ResumoSmart[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<{ id: string; motivo: string } | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [salvoConfig, setSalvoConfig] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/admin/smart-torneios?status=${aba}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar os pedidos");
      setLista(data.smartTorneios);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    }
  }, [aba]);

  useEffect(() => {
    setLista(null);
    void carregar();
  }, [carregar]);

  useEffect(() => {
    fetch("/api/v1/admin/smart-torneios/config", { cache: "no-store" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => null);
  }, []);

  async function decidir(id: string, acao: "aprovar" | "recusar" | "teste" | "excluir", motivo?: string, teste?: boolean) {
    try {
      setOcupado(id);
      setErro(null);
      const res = await fetch(`/api/v1/admin/smart-torneios/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo, teste }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Não foi possível concluir");
      setRecusando(null);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setOcupado(null);
    }
  }

  async function salvarConfig() {
    if (!config) return;
    try {
      setOcupado("config");
      setErro(null);
      const res = await fetch("/api/v1/admin/smart-torneios/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Não foi possível salvar");
      setConfig(data);
      setSalvoConfig(true);
      setTimeout(() => setSalvoConfig(false), 2500);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setOcupado(null);
    }
  }

  const campo = "h-10 w-full rounded-[10px] border border-line bg-white px-3 text-sm font-semibold text-ink";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Play na Quadra"
        title="Smart Torneios"
        description="Torneios privados criados pelos atletas no app. Confira o Pix recebido e autorize para liberar o código de inscrição."
      />

      {erro && <Alert>{erro}</Alert>}

      <div className="flex flex-wrap gap-1 rounded-[12px] border border-line bg-white p-1">
        {ABAS.map((a) => (
          <button
            key={a.status}
            type="button"
            onClick={() => setAba(a.status)}
            className={cn("h-9 rounded-[9px] px-4 text-[13px] font-bold", aba === a.status ? "bg-ink text-white" : "text-ink-2 hover:bg-sand-2")}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {!lista ? (
        <Card className="h-32 animate-pulse" />
      ) : lista.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum pedido aqui" description="Os pedidos de Smart Torneio aparecem conforme os atletas criam pelo app." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {lista.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-ink">{s.torneio?.nome}</h3>
                  <div className="text-[13px] text-muted">
                    {dataBR(s.torneio?.data ?? null)} · {s.torneio?.local}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {s.teste && <Badge tone="warning">Teste</Badge>}
                  <Badge tone="dark" className="font-mono tracking-wider">
                    {s.codigo}
                  </Badge>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <dt className="text-muted">Criador</dt>
                <dd className="truncate font-semibold text-ink">
                  {s.criador?.nome}
                  {s.criador?.telefone ? ` · ${s.criador.telefone}` : ""}
                </dd>
                <dt className="text-muted">Categoria</dt>
                <dd className="font-semibold text-ink">
                  {GENERO[s.categoria?.genero ?? ""] ?? s.categoria?.genero} ·{" "}
                  {s.categoria?.formato === "AMERICANO"
                    ? "americano (parceiro rotativo)"
                    : `${s.categoria?.tipoParticipacao === "DUPLAS_SORTEADAS" ? "duplas sorteadas" : "duplas"} · ${s.categoria?.formato === "MATA_MATA" ? "só mata-mata" : "grupos + mata-mata"}`}
                </dd>
                <dt className="text-muted">Atletas</dt>
                <dd className="font-semibold text-ink">
                  {s.quantidadeAtletas} habilitados · {s.categoria?.inscricoes ?? 0} inscrição(ões)
                </dd>
                <dt className="text-muted">Valor</dt>
                <dd className="font-extrabold text-ink">{moeda(s.valor)}</dd>
                {s.pagamentoInformadoEm && (
                  <>
                    <dt className="text-muted">Disse que pagou</dt>
                    <dd className="font-semibold text-ink">{quando(s.pagamentoInformadoEm)}</dd>
                  </>
                )}
                {s.motivoRecusa && (
                  <>
                    <dt className="text-muted">Motivo da recusa</dt>
                    <dd className="font-semibold text-ink">{s.motivoRecusa}</dd>
                  </>
                )}
              </dl>

              {(s.status === "AGUARDANDO_APROVACAO" || s.status === "AGUARDANDO_PAGAMENTO") &&
                (recusando?.id === s.id ? (
                  <div className="flex flex-col gap-2 rounded-[10px] bg-sand p-3">
                    <label htmlFor={`motivo-${s.id}`} className="text-[13px] font-bold text-ink">
                      Motivo da recusa (o atleta recebe)
                    </label>
                    <input
                      id={`motivo-${s.id}`}
                      value={recusando.motivo}
                      onChange={(e) => setRecusando({ id: s.id, motivo: e.target.value })}
                      placeholder="Pagamento não identificado"
                      className={campo}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" disabled={ocupado === s.id} onClick={() => decidir(s.id, "recusar", recusando.motivo)}>
                        Confirmar recusa
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRecusando(null)}>
                        Voltar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" icon={<Check />} disabled={ocupado === s.id} onClick={() => decidir(s.id, "aprovar")}>
                      {ocupado === s.id ? "Autorizando…" : `Autorizar (Pix de ${moeda(s.valor)} conferido)`}
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X />} onClick={() => setRecusando({ id: s.id, motivo: "" })}>
                      Recusar
                    </Button>
                  </div>
                ))}

              <div className="flex flex-wrap items-center gap-2">
                {s.status === "APROVADO" && s.torneio && (
                  <LinkButton size="sm" href={`/admin/torneios/${s.torneio.slug}`}>
                    Abrir torneio
                  </LinkButton>
                )}
                {s.telaoUrl && (
                  <LinkButton size="sm" variant="ghost" href={s.telaoUrl} target="_blank">
                    Telão sem login
                  </LinkButton>
                )}
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                  <input
                    type="checkbox"
                    checked={s.teste}
                    disabled={ocupado === s.id}
                    onChange={(e) => decidir(s.id, "teste", undefined, e.target.checked)}
                    className="h-4 w-4"
                  />
                  Teste (sem avisos)
                </label>
                {s.teste && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={ocupado === s.id}
                    onClick={() => {
                      if (window.confirm(`Excluir o teste "${s.torneio?.nome}" com todos os jogos e inscrições? Não dá para desfazer.`)) {
                        void decidir(s.id, "excluir");
                      }
                    }}
                  >
                    Excluir teste
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-4 p-4">
        <div>
          <h2 className="text-base font-extrabold text-ink">Preço e Pix</h2>
          <p className="text-[13px] text-muted">Valor cobrado por atleta habilitado, com mínimo. O Pix copia e cola dos pedidos usa esta chave.</p>
        </div>
        {config && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["valorPorAtleta", "Valor por atleta (R$)", "number"],
                ["valorMinimo", "Valor mínimo (R$)", "number"],
                ["pixChave", "Chave Pix", "text"],
                ["pixNome", "Nome do recebedor", "text"],
                ["pixCidade", "Cidade do recebedor", "text"],
              ] as const
            ).map(([chave, rotulo, tipo]) => (
              <label key={chave} htmlFor={`cfg-${chave}`} className="flex flex-col gap-1 text-[13px] font-bold text-ink">
                {rotulo}
                <input
                  id={`cfg-${chave}`}
                  type={tipo}
                  step={tipo === "number" ? "0.5" : undefined}
                  value={(config[chave] as string | number | null) ?? ""}
                  onChange={(e) => setConfig({ ...config, [chave]: tipo === "number" ? Number(e.target.value) : e.target.value })}
                  className={campo}
                />
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button variant="dark" icon={<Save />} disabled={!config || ocupado === "config"} onClick={salvarConfig}>
            Salvar
          </Button>
          {salvoConfig && (
            <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[#17663f]">
              <Check className="h-4 w-4" /> Salvo
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
