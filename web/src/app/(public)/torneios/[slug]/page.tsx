import { db } from "@/db";
import { tournaments, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Calendar, MapPin, Trophy, ArrowLeft } from "lucide-react";

export default async function TournamentDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Buscar dados do torneio
  const tournamentResult = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);

  const tournament = tournamentResult[0];

  if (!tournament) {
    notFound();
  }

  // Buscar categorias
  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.tournamentId, tournament.id));

  // Formatar datas
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(date));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header Imagem */}
      <div className="relative h-[400px] w-full bg-gray-900">
        {tournament.bannerUrl && (
          <Image
            src={tournament.bannerUrl}
            alt={tournament.name}
            fill
            className="object-cover opacity-60"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
        
        <div className="absolute bottom-0 left-0 w-full p-8">
          <div className="container mx-auto">
            <Link href="/torneios" className="inline-flex items-center text-white/80 hover:text-white mb-6 transition-colors">
              <ArrowLeft size={20} className="mr-2" /> Voltar para lista
            </Link>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">{tournament.name}</h1>
            <div className="flex flex-wrap gap-6 text-white/90">
              <div className="flex items-center gap-2">
                <Calendar className="text-orange-500" />
                <span>{formatDate(tournament.startDate)} a {formatDate(tournament.endDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="text-orange-500" />
                <span>{tournament.location}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-10 relative z-10">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Coluna Principal */}
          <div className="md:col-span-2 space-y-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Trophy className="text-primary" /> Categorias Disponíveis
              </h2>
              
              <div className="grid gap-4">
                {cats.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-primary/30 transition-colors bg-gray-50/50 hover:bg-white">
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">{cat.name}</h3>
                      <p className="text-sm text-gray-500">Duplas • Max {cat.maxPairs || 32} vagas</p>
                    </div>
                    <div className="text-right">
                      <span className="block text-xl font-bold text-primary">R$ {parseFloat(cat.price as string).toFixed(2)}</span>
                      <Link 
                        href={`/torneios/${slug}/inscricao?cat=${cat.id}`}
                        className="inline-block mt-2 px-4 py-2 bg-secondary text-primary text-sm font-bold rounded-lg hover:bg-yellow-400 transition-colors"
                      >
                        Inscrever-se
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Sobre o Torneio</h2>
              <div className="prose text-gray-600">
                <p>
                  Prepare-se para a {tournament.name}! Um evento imperdível que reunirá os melhores atletas da região na {tournament.location}.
                  Garanta sua vaga e venha competir em uma estrutura profissional com quadras de alta qualidade, área de descanso e premiação exclusiva.
                </p>
                <ul className="mt-4 space-y-2 list-disc list-inside">
                  <li>Camiseta oficial para todos os inscritos</li>
                  <li>Hidratação e frutas durante os jogos</li>
                  <li>Fisioterapia à disposição</li>
                  <li>Transmissão das finais ao vivo</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
              <h3 className="font-bold text-lg text-gray-900 mb-4">Status das Inscrições</h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Status</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 uppercase">
                  {tournament.status === 'OPEN_FOR_REGISTRATION' ? 'Abertas' : 'Encerradas'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                <div className="bg-primary h-2.5 rounded-full" style={{ width: '45%' }}></div>
              </div>
              <p className="text-xs text-gray-500 text-center mb-6">45% das vagas preenchidas</p>
              
              <Link 
                href="/login" 
                className="w-full block text-center py-3 bg-primary text-white font-bold rounded-xl hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
              >
                Acessar Área do Atleta
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
