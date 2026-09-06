import Link from "next/link";
import { notFound } from "next/navigation";
import { torneiosService } from "@/services/torneios.service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function TorneioJogosDoDiaPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);

  if (!torneio || torneio.oculto) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Jogos do dia</h1>
            <p className="text-slate-600 mt-1">{torneio.nome}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/torneios/${torneio.slug}`}
              className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              Voltar ao torneio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

