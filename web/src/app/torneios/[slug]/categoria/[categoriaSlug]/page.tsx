import { notFound } from "next/navigation";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import CategoriaDetalhesContent from "./CategoriaDetalhesContent";

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string; categoriaSlug: string }>;
}

export default async function CategoriaDetalhesPage({ params }: PageProps) {
  const { slug, categoriaSlug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);

  if (!torneio) {
    notFound();
  }

  const categoria = await categoriasService.buscarPorSlug(torneio.id, categoriaSlug);

  if (!categoria) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header da Página */}
      <div className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <Link href="/torneios" className="hover:text-blue-600 transition-colors">Torneios</Link>
            <ChevronLeft className="w-4 h-4" />
            <Link href={`/torneios/${slug}`} className="hover:text-blue-600 transition-colors">{torneio.nome}</Link>
            <ChevronLeft className="w-4 h-4" />
            <span className="text-slate-900 font-medium">{categoria.nome}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{categoria.nome}</h1>
              <p className="text-slate-500 mt-1">{categoria.genero}</p>
            </div>
            
            <Link 
              href={`/torneios/${slug}`}
              className="hidden md:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar para o torneio
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <CategoriaDetalhesContent 
          torneio={{
            id: torneio.id,
            nome: torneio.nome,
            slug: torneio.slug,
            status: torneio.status,
            bannerUrl: torneio.bannerUrl,
            templateUrl: torneio.templateUrl ?? null,
            esporteNome: torneio.esporteNome,
          }} 
          categoria={{
            id: categoria.id,
            nome: categoria.nome,
            genero: categoria.genero,
            valorInscricao: categoria.valorInscricao,
            vagasMaximas: categoria.vagasMaximas,
          }}
        />
      </div>
    </div>
  );
}
