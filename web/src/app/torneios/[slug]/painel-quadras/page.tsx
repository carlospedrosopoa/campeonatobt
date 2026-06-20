import Link from "next/link";
import { notFound } from "next/navigation";
import { MonitorPlay } from "lucide-react";
import { torneiosService } from "@/services/torneios.service";
import PainelQuadrasPublicContent from "./PainelQuadrasPublicContent";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ modo?: string }>;
}

export default async function TorneioPainelQuadrasPublicPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const torneio = await torneiosService.buscarPorSlug(slug);
  const modoInicial = query.modo === "destaque" ? "destaque" : "grade";

  if (!torneio || torneio.oculto) notFound();

  return (
    <>
      <div className="fixed left-4 top-4 z-50 flex gap-2">
        <Link
          href={`/torneios/${torneio.slug}`}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-slate-800/90"
        >
          <MonitorPlay className="h-4 w-4" />
          Voltar ao torneio
        </Link>
      </div>
      <PainelQuadrasPublicContent slug={torneio.slug} nomeTorneio={torneio.nome} modoInicial={modoInicial} />
    </>
  );
}
