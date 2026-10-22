"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Medal, Plus } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { RankingForm, formatarPeriodo } from "@/components/admin/rankings/ranking-form";

type RankingResumo = { id: string; nome: string; descricao: string | null; dataInicio: string; dataFim: string; imagemUrl: string | null; atletas: number };

function situacao(r: RankingResumo) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (hoje < r.dataInicio) return { label: "Em breve", tone: "info" as const };
  if (hoje > r.dataFim) return { label: "Encerrado", tone: "neutral" as const };
  return { label: "Em andamento", tone: "success" as const };
}

export default function RankingsPage() {
  const router = useRouter();
  const [rankings, setRankings] = useState<RankingResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/rankings", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Não foi possível carregar os rankings");
        setRankings(data.rankings);
      })
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Play na Quadra"
        title="Rankings"
        description="Rankings com período, atletas e pontuação. Depois, os torneios vão alimentar a pontuação por regra."
        actions={
          !criando && (
            <Button variant="primary" icon={<Plus />} onClick={() => setCriando(true)}>
              Novo ranking
            </Button>
          )
        }
      />

      {erro && <Alert>{erro}</Alert>}

      {criando && (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-base font-extrabold text-ink">Novo ranking</h2>
          <RankingForm
            textoBotao="Criar ranking"
            onCancelar={() => setCriando(false)}
            onSalvar={async (dados) => {
              const res = await fetch("/api/v1/admin/rankings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dados),
              });
              const data = await res.json().catch(() => null);
              if (!res.ok) throw new Error(data?.error || "Não foi possível criar");
              router.push(`/admin/rankings/${data.id}`);
            }}
          />
        </Card>
      )}

      {rankings && rankings.length === 0 && !criando && (
        <EmptyState icon={<Medal />} title="Nenhum ranking ainda" description="Crie o primeiro ranking para começar a pontuar os atletas." />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rankings?.map((r) => {
          const s = situacao(r);
          return (
            <Link key={r.id} href={`/admin/rankings/${r.id}`} className="block">
              <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                {r.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imagemUrl} alt="" className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-sand-2 text-muted">
                    <Medal className="h-10 w-10" />
                  </div>
                )}
                <div className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-extrabold text-ink">{r.nome}</h2>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <p className="text-[13px] text-muted">{formatarPeriodo(r.dataInicio, r.dataFim)}</p>
                  <p className="text-[13px] font-semibold text-ink-2">
                    {r.atletas} {r.atletas === 1 ? "atleta" : "atletas"}
                  </p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
