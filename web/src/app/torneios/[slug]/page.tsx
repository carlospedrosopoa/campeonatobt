import { notFound } from "next/navigation";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { apoiadoresService } from "@/services/apoiadores.service";
import { Calendar, MapPin, Trophy, Users, Info } from "lucide-react";
import Link from "next/link";

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function TorneioDetalhesPage({ params }: PageProps) {
  const { slug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);

  if (!torneio) {
    notFound();
  }

  const categorias = await categoriasService.listarPorTorneio(torneio.id);
  const apoiadores = await apoiadoresService.listarPorTorneio(torneio.id);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Banner Header */}
      <div className="relative w-full min-h-[300px] md:min-h-[400px] md:aspect-[4/1] bg-slate-900 overflow-hidden group">
        {torneio.bannerUrl ? (
          <img 
            src={torneio.bannerUrl} 
            alt={torneio.nome}
            className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-blue-900 to-slate-900">
            <Trophy className="h-24 w-24 text-white/20" />
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 to-transparent flex flex-col justify-end p-6 md:p-12">
          <div className="container mx-auto">
            <div className="inline-block rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white mb-4 uppercase tracking-wide">
              {torneio.esporteNome}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 shadow-sm">
              {torneio.nome}
            </h1>
            <div className="flex flex-wrap gap-4 text-white/90 text-sm md:text-base">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-400" />
                <span>
                  {new Date(torneio.dataInicio).toLocaleDateString('pt-BR')} 
                  {torneio.dataFim ? ` até ${new Date(torneio.dataFim).toLocaleDateString('pt-BR')}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-orange-400" />
                <span>{torneio.local}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Esquerda: Informações e Categorias */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Sobre o Torneio */}
            <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                <Info className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-bold text-slate-800">Sobre o Torneio</h2>
              </div>
              <div className="prose prose-slate max-w-none text-gray-600">
                {torneio.descricao ? (
                  <p className="whitespace-pre-wrap">{torneio.descricao}</p>
                ) : (
                  <p className="italic text-gray-400">Nenhuma descrição informada.</p>
                )}
              </div>
            </section>

            {/* Categorias */}
            <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-2">
                <Users className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-bold text-slate-800">Categorias</h2>
              </div>
              
              {categorias.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categorias.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors">
                      <div>
                        <h3 className="font-bold text-slate-700">{cat.nome}</h3>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">{cat.genero}</p>
                      </div>
                      <Link 
                        href={`/torneios/${torneio.slug}/categoria/${cat.slug}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        Acessar categoria &rarr;
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  Nenhuma categoria cadastrada ainda.
                </div>
              )}
            </section>

            {apoiadores.length > 0 ? (
              <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-2">
                  <Trophy className="h-5 w-5 text-orange-500" />
                  <h2 className="text-xl font-bold text-slate-800">Apoiadores</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                  {apoiadores.map((apoiador) => {
                    if (!apoiador.logoUrl) return null;
                    const card = (
                      <div className="h-full rounded-xl border border-slate-100 bg-white p-4 flex items-center justify-center hover:border-orange-200 transition-colors">
                        <img
                          src={apoiador.logoUrl}
                          alt={apoiador.nome}
                          className="h-24 w-24 rounded-xl object-contain"
                        />
                      </div>
                    );
                    if (apoiador.siteUrl) {
                      return (
                        <a key={apoiador.id} href={apoiador.siteUrl} target="_blank" rel="noreferrer">
                          {card}
                        </a>
                      );
                    }
                    return <div key={apoiador.id}>{card}</div>;
                  })}
                </div>
              </section>
            ) : null}

          </div>

          {/* Coluna Direita: Status e Ações */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 sticky top-24">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Status do Evento</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-gray-600">Situação</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase
                    ${torneio.status === 'ABERTO' ? 'bg-green-100 text-green-700' : 
                      torneio.status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-700' : 
                      torneio.status === 'FINALIZADO' ? 'bg-slate-200 text-slate-700' : 
                      torneio.status === 'CANCELADO' ? 'bg-red-100 text-red-700' : 
                      'bg-yellow-100 text-yellow-700'}`}>
                    {torneio.status}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-gray-600">Total de Categorias</span>
                  <span className="font-semibold text-slate-900">{categorias.length}</span>
                </div>

                <button 
                  disabled
                  className="w-full mt-4 bg-gray-100 text-gray-400 font-bold py-3 rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Inscrições em Breve
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
