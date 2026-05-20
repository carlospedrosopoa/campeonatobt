import Link from "next/link";
import { notFound } from "next/navigation";
import { torneiosService } from "@/services/torneios.service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function ymdSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function TorneioJogosDoDiaPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);

  if (!torneio || torneio.oculto) notFound();

  const dataHoje = ymdSaoPaulo();
  const jsonUrl = `/api/public/torneios/${encodeURIComponent(slug)}/jogos-do-dia?data=${encodeURIComponent(dataHoje)}`;

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
            <a
              href={jsonUrl}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              target="_blank"
              rel="noreferrer"
            >
              Abrir JSON (extensão)
            </a>
          </div>
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-sm text-slate-600">
            Endpoint público (para validar a extensão):{" "}
            <a className="text-blue-700 hover:underline break-all" href={jsonUrl} target="_blank" rel="noreferrer">
              {jsonUrl}
            </a>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Parâmetros: <span className="font-mono">data=YYYY-MM-DD</span> e opcional{" "}
            <span className="font-mono">mencoes=@a,@b,@c</span>.
          </div>
        </div>
      </div>
    </div>
  );
}

