import Link from "next/link";
import { torneiosService } from "@/services/torneios.service";
import { Calendar, MapPin, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const torneiosRecentes = await torneiosService.listarRecentes();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-gradient-to-r from-blue-900 to-slate-900 text-white">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                Gerencie seus Torneios com Nível Profissional
              </h1>
              <p className="mx-auto max-w-[700px] text-gray-300 md:text-xl">
                A plataforma completa para Beach Tennis, Padel, Vôlei e muito mais. 
                Inscrições, chaves automáticas e resultados em tempo real.
              </p>
            </div>
            <div className="space-x-4">
              <Link
                href="/torneios"
                className="inline-flex h-10 items-center justify-center rounded-md bg-orange-500 px-8 text-sm font-medium text-white shadow transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Buscar Torneios
              </Link>
              <Link
                href="/organizador"
                className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-8 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Sou Organizador
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Torneios Ativos */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-slate-50">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-slate-900">
              Torneios em Destaque
            </h2>
            <p className="max-w-[900px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Confira os próximos eventos e garanta sua inscrição.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {torneiosRecentes.map((torneio) => (
              <div key={torneio.id} className="group relative overflow-hidden rounded-lg border bg-white shadow-md transition-all hover:shadow-xl">
                <div className="aspect-video w-full overflow-hidden bg-gray-200 relative">
                  {torneio.bannerUrl ? (
                    <img 
                      src={torneio.bannerUrl} 
                      alt={torneio.nome}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-slate-100 text-slate-400">
                      <Trophy className="h-12 w-12" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm">
                    {torneio.esporteNome || 'Esporte'}
                  </div>
                </div>
                
                <div className="p-5 space-y-3">
                  <h3 className="text-xl font-bold text-slate-900 line-clamp-1">{torneio.nome}</h3>
                  
                  <div className="space-y-2 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-500" />
                      <span>{new Date(torneio.dataInicio).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-orange-500" />
                      <span className="line-clamp-1">{torneio.local}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Link 
                      href={`/torneios/${torneio.slug}`}
                      className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      Ver Detalhes
                    </Link>
                  </div>
                </div>
              </div>
            ))}

            {torneiosRecentes.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                Nenhum torneio encontrado no momento.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
