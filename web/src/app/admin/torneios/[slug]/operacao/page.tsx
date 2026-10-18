"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Megaphone, MonitorPlay, Play, Smartphone, Undo2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";
import { acoesOperacao, etapaJogo, minutosDesde, nomeDupla, tempoDesde, useOperacao, type JogoOperacao } from "@/components/admin/operacao/comum";

const CHAVE_CATEGORIA = "operacao:categoria";

/** Mesa de controle do arbitro central: quadras, sugestao de chamada e fila da categoria em andamento. */
export default function OperacaoPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const busca = useSearchParams();
  const [categoriaId, setCategoriaId] = useState<string | null>(busca.get("categoria"));
  const { estado, erro, recarregar } = useOperacao(slug, categoriaId);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    if (categoriaId) return;
    try {
      const salva = localStorage.getItem(`${CHAVE_CATEGORIA}:${slug}`);
      if (salva) setCategoriaId(salva);
    } catch {}
  }, [slug, categoriaId]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function escolherCategoria(id: string) {
    setCategoriaId(id || null);
    try {
      localStorage.setItem(`${CHAVE_CATEGORIA}:${slug}`, id);
    } catch {}
    router.replace(id ? `?categoria=${id}` : "?");
  }

  async function executar(chave: string, fn: () => Promise<unknown>) {
    try {
      setOcupado(chave);
      setFalha(null);
      await fn();
      await recarregar();
    } catch (e: any) {
      setFalha(e?.message || "Erro inesperado");
    } finally {
      setOcupado(null);
    }
  }

  const tolerancia = estado?.torneio.toleranciaAtrasoMin ?? 15;
  const quadrasLivres = estado?.quadras.filter((q) => !q.jogo) ?? [];
  const qsCategoria = categoriaId ? `?categoria=${categoriaId}` : "";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operação ao vivo"
        title="Mesa de controle"
        description="O sistema sugere o próximo jogo de cada quadra livre (os 4 atletas presentes). Você confirma a chamada; o telão anuncia por voz."
        actions={
          <>
            <LinkButton href={`/admin/torneios/${slug}/operacao/telao${qsCategoria}`} target="_blank" icon={<MonitorPlay />}>
              Abrir telão
            </LinkButton>
          </>
        }
      />

      {(erro || falha) && <Alert>{falha || erro}</Alert>}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-1 flex-col gap-1 text-[13px] font-bold text-ink">
          Categoria em andamento
          <select
            value={categoriaId ?? ""}
            onChange={(e) => escolherCategoria(e.target.value)}
            className="h-10 rounded-[10px] border border-line bg-white px-3 text-sm font-semibold text-ink"
          >
            <option value="">Selecione a categoria</option>
            {estado?.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {c.encerrados}/{c.total} jogos encerrados
              </option>
            ))}
          </select>
        </label>
        {estado?.categoria && (
          <div className="min-w-[180px]">
            <div className="text-[13px] font-semibold text-muted">
              {estado.progresso.encerrados}/{estado.progresso.total} jogos encerrados
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand-2">
              <div
                className="h-full rounded-full bg-[#17663f]"
                style={{ width: `${estado.progresso.total ? (estado.progresso.encerrados / estado.progresso.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {!estado ? (
        <Card className="h-40 animate-pulse" />
      ) : estado.quadras.length === 0 ? (
        <EmptyState title="Nenhuma quadra ativa" description="Defina quantas quadras estão em uso no Painel de quadras." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {estado.quadras.map((q) => {
            const jogo = q.jogo;
            const atrasado = jogo && jogo.status === "AGENDADA" && minutosDesde(jogo.chamadoEm, agora) > tolerancia;
            return (
              <Card key={q.numero} className={cn("flex flex-col gap-3 p-4", atrasado && "border-red-300")}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-bold text-ink">{q.nome}</h3>
                    {q.reserva && <div className="truncate text-xs font-bold text-ocean-strong">Reservada: {q.reserva.descricao}</div>}
                  </div>
                  {jogo ? (
                    jogo.status === "EM_ANDAMENTO" ? (
                      <Badge tone="live" dot>
                        Em jogo · {tempoDesde(jogo.iniciadoEm, agora)}
                      </Badge>
                    ) : (
                      <Badge tone={atrasado ? "danger" : "warning"}>Chamado · {tempoDesde(jogo.chamadoEm, agora)}</Badge>
                    )
                  ) : (
                    <Badge tone="success">Livre</Badge>
                  )}
                </div>

                {jogo ? (
                  <>
                    <JogoResumo jogo={jogo} />
                    {atrasado && (
                      <p className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                        <AlertTriangle className="h-4 w-4" /> Passou da tolerância de {tolerancia} min. Decida: aguardar, devolver à fila ou W.O.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {jogo.status === "AGENDADA" && (
                        <>
                          <Button size="sm" variant="dark" icon={<Play />} disabled={Boolean(ocupado)} onClick={() => executar(`i${jogo.id}`, () => acoesOperacao.iniciar(slug, jogo.id))}>
                            Começou
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Megaphone />} disabled={Boolean(ocupado)} onClick={() => executar(`r${jogo.id}`, () => acoesOperacao.chamar(slug, jogo.id, q.numero))}>
                            Chamar de novo
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Undo2 />} disabled={Boolean(ocupado)} onClick={() => executar(`d${jogo.id}`, () => acoesOperacao.devolver(slug, jogo.id))}>
                            Devolver à fila
                          </Button>
                        </>
                      )}
                      <LinkButton size="sm" variant="ghost" href={`/admin/torneios/${slug}/operacao/quadra/${q.numero}`} target="_blank" icon={<Smartphone />}>
                        Tela da quadra
                      </LinkButton>
                    </div>
                  </>
                ) : q.sugestao ? (
                  <div className="rounded-[10px] border border-dashed border-line bg-paper p-3">
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">Próximo sugerido</div>
                    <JogoResumo jogo={q.sugestao} />
                    <Button
                      className="mt-3 w-full"
                      variant="primary"
                      icon={<Megaphone />}
                      disabled={Boolean(ocupado)}
                      onClick={() => executar(`c${q.sugestao!.id}`, () => acoesOperacao.chamar(slug, q.sugestao!.id, q.numero))}
                    >
                      {ocupado === `c${q.sugestao.id}` ? "Chamando…" : `Chamar para a ${q.nome}`}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    {q.aguardando ?? (estado.categoria ? "Nenhum jogo pronto: aguardando atletas na fila." : "Escolha a categoria em andamento.")}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {estado?.categoria && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <Users className="h-[18px] w-[18px]" /> Fila · {estado.categoria.nome}
            </h2>
            <span className="text-[13px] text-muted">{estado.fila.length} jogo(s) aguardando</span>
          </div>
          {estado.fila.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Sem jogos na fila. Quando a fase atual terminar, os próximos jogos da chave entram aqui.</p>
          ) : (
            <ul className="divide-y divide-line">
              {estado.fila.map((j, idx) => (
                <li key={j.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <span className="w-6 shrink-0 text-sm font-extrabold text-muted">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <JogoResumo jogo={j} compacto />
                  </div>
                  {quadrasLivres.length > 0 && (
                    <select
                      className="h-9 rounded-[10px] border border-line bg-white px-2 text-[13px] font-semibold text-ink"
                      value=""
                      disabled={Boolean(ocupado)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (n) void executar(`c${j.id}`, () => acoesOperacao.chamar(slug, j.id, n));
                      }}
                      title="Chamar este jogo agora, mesmo fora da ordem"
                    >
                      <option value="">Chamar para…</option>
                      {quadrasLivres.map((q) => (
                        <option key={q.numero} value={q.numero}>
                          {q.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function JogoResumo({ jogo, compacto }: { jogo: JogoOperacao; compacto?: boolean }) {
  const completo = jogo.presentes === jogo.total;
  return (
    <div className="min-w-0">
      <div className={cn("font-bold text-ink", compacto ? "text-sm" : "text-[15px]")}>
        <div className="truncate">{nomeDupla(jogo.equipeA)}</div>
        <div className="text-xs font-semibold text-muted">contra</div>
        <div className="truncate">{nomeDupla(jogo.equipeB)}</div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>{etapaJogo(jogo)}</span>
        {jogo.status === "AGENDADA" && jogo.chamadoEm && !jogo.quadra && <span className="font-bold text-[#8a4e00]">chamado sem quadra</span>}
        <span className={cn("font-bold", completo ? "text-[#17663f]" : "text-[#8a4e00]")}>
          {jogo.presentes}/{jogo.total} presentes
        </span>
        {!completo && jogo.faltando.length > 0 && <span className="truncate">falta: {jogo.faltando.join(", ")}</span>}
        {jogo.ocupados.length > 0 && <span className="font-bold text-red-700">em outra quadra: {jogo.ocupados.join(", ")}</span>}
      </div>
    </div>
  );
}
