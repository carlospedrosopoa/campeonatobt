import Link from "next/link";
import { torneiosService } from "@/services/torneios.service";
import { Calendar, MapPin, Search, Trophy } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function TorneiosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  // TODO: Implementar busca no service. Por enquanto lista todos recentes.
  const torneios = await torneiosService.listarRecentes(); 

  const filtrados = q 
    ? torneios.filter(t => t.nome.toLowerCase().includes(q.toLowerCase()) || (t.local && t.local.toLowerCase().includes(q.toLowerCase())))
    : torneios;

  return (
    <div className="container py-10 space-y-8">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Torneios</h1>
          <p className="text-muted-foreground">Encontre seu próximo desafio.</p>
        </div>
        
        <form className="relative w-full md:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar torneios..."
            className="w-full md:w-[300px] rounded-md border border-gray-200 bg-white px-9 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-900"
          />
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtrados.map((torneio) => (
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

        {filtrados.length === 0 && (
          <div className="col-span-full text-center py-20 text-gray-500">
            Nenhum torneio encontrado para sua busca.
          </div>
        )}
      </div>
    </div>
  );
}
