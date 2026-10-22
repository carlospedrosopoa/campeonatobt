"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Medal, Plus } from "lucide-react";
import { Alert, Button, Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { RankingForm, rotuloJanela } from "@/components/admin/rankings/ranking-form";

type RankingResumo = {
  id: string;
  nome: string;
  descricao: string | null;
  janelaMeses: number;
  imagemUrl: string | null;
  categorias: number;
  atletas: number;
};

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
        description="Rankings com categorias, pontuação permanente e de entrada. Depois, os torneios vão alimentar a pontuação por regra."
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
        {rankings?.map((r) => (
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
                <h2 className="text-base font-extrabold text-ink">{r.nome}</h2>
                <p className="text-[13px] text-muted">Entrada: {rotuloJanela(r.janelaMeses)}</p>
                <p className="text-[13px] font-semibold text-ink-2">
                  {r.categorias} {r.categorias === 1 ? "categoria" : "categorias"} · {r.atletas} {r.atletas === 1 ? "atleta" : "atletas"}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
