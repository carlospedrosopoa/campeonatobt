import Image from "next/image";
import Link from "next/link";
import { Calendar, MapPin, Trophy, ArrowRight, Users } from "lucide-react";
import { db } from "@/db";
import { tournaments, categories } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();

  // Buscar torneios reais do banco de dados
  const activeTournaments = await db
    .select()
    .from(tournaments)
    .orderBy(desc(tournaments.startDate))
    .limit(3);

  // Buscar categorias para cada torneio (para mostrar na lista)
  const tournamentsWithCats = await Promise.all(
    activeTournaments.map(async (t) => {
      const cats = await db
        .select({ name: categories.name })
        .from(categories)
        .where(eq(categories.tournamentId, t.id))
        .limit(3); // Pegar só 3 para exemplo
      return { ...t, categories: cats.map(c => c.name) };
    })
  );

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    }).format(new Date(date));
  };
  
  // Pegar o torneio principal (o mais recente) para o Hero
  const heroTournament = tournamentsWithCats[0];

  return (
    <div className="min-h-screen flex flex-col font-sans bg-gray-50">
      {/* Header / Navigation */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary tracking-tight">
              Beach<span className="text-orange-500">Tennis</span><span className="text-gray-400 text-sm font-normal ml-1">Manager</span>
            </span>
          </div>
          <nav className="hidden md:flex gap-8 text-gray-600 font-medium">
            <Link href="/" className="text-primary">Início</Link>
            <Link href="/torneios" className="hover:text-primary transition-colors">Torneios</Link>
            <Link href="/ranking" className="hover:text-primary transition-colors">Ranking Geral</Link>
          </nav>
          <div className="flex gap-3">
             {session ? (
               <Link 
                href={session.user.role === 'ADMIN' || session.user.role === 'ORGANIZER' ? "/admin" : "/dashboard"} 
                className="px-5 py-2 text-primary font-medium hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
              >
                {session.user.role === 'ADMIN' ? 'Painel Admin' : 'Meu Painel'}
              </Link>
             ) : (
               <Link 
                href="/login" 
                className="px-5 py-2 text-primary font-medium hover:bg-blue-50 rounded-lg transition-colors"
              >
                Acessar / Login
              </Link>
             )}
            <Link 
              href="/torneios" 
              className="px-5 py-2 bg-primary text-white font-bold rounded-lg hover:bg-blue-900 transition-colors shadow-md hover:shadow-lg"
            >
              Inscrever-se
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 bg-primary overflow-hidden">
           {/* Background Pattern */}
           <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
           
           <div className="container mx-auto px-4 relative z-10 flex flex-col md:flex-row items-center gap-12">
              <div className="flex-1 text-center md:text-left text-white">
                <span className="inline-block py-1 px-3 rounded-full bg-orange-500/20 text-orange-300 text-sm font-bold mb-4 border border-orange-500/30">
                  PLATAFORMA OFICIAL
                </span>
                <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                  Gerencie sua paixão pelo <span className="text-secondary">Beach Tennis</span>
                </h1>
                <p className="text-lg md:text-xl text-blue-100 mb-8 max-w-xl mx-auto md:mx-0 leading-relaxed">
                  O hub central para os melhores torneios. Inscreva-se, acompanhe chaves em tempo real e visualize sua evolução no ranking.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                  <Link 
                    href="/torneios" 
                    className="px-8 py-4 bg-secondary text-primary font-bold text-lg rounded-xl hover:bg-yellow-200 transition-transform transform hover:scale-105 shadow-xl flex items-center justify-center gap-2"
                  >
                    Ver Torneios <ArrowRight size={20} />
                  </Link>
                  <Link 
                    href="/ranking" 
                    className="px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-bold text-lg rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trophy size={20} /> Ranking
                  </Link>
                </div>
              </div>
              
              {/* Hero Image / Composition */}
              <div className="flex-1 relative">
                <div className="relative z-10 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                  <div className="aspect-video bg-gray-800 relative">
                     {heroTournament ? (
                       <>
                         {heroTournament.bannerUrl && (
                           <div className="w-full h-full relative">
                              <Image 
                                src={heroTournament.bannerUrl} 
                                alt={heroTournament.name}
                                fill
                                className="object-cover opacity-80 hover:opacity-100 transition-opacity"
                              />
                           </div>
                         )}
                         <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
                            <p className="font-bold text-lg">{heroTournament.name}</p>
                            <p className="text-sm text-gray-300">Inscrições Abertas</p>
                         </div>
                         <Link href={`/torneios/${heroTournament.slug}`} className="absolute inset-0 z-20"></Link>
                       </>
                     ) : (
                       <div className="w-full h-full bg-gray-700 flex items-center justify-center text-white/20">
                          Sem torneio ativo
                       </div>
                     )}
                  </div>
                </div>
                {/* Decorative Elements */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-500 rounded-full blur-3xl opacity-30"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-400 rounded-full blur-3xl opacity-20"></div>
              </div>
           </div>
        </section>

        {/* Torneios em Destaque */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-12">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Torneios em Destaque</h2>
                <p className="text-gray-500 mt-2">Participe dos próximos eventos confirmados</p>
              </div>
              <Link href="/torneios" className="hidden md:flex items-center gap-2 text-primary font-semibold hover:underline">
                Ver todos <ArrowRight size={16} />
              </Link>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {tournamentsWithCats.map((tournament) => (
                <div key={tournament.id} className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col">
                  <div className="h-48 overflow-hidden relative">
                    {tournament.bannerUrl && (
                       <Image
                         src={tournament.bannerUrl}
                         alt={tournament.name}
                         fill
                         className="object-cover group-hover:scale-110 transition-transform duration-500"
                       />
                    )}
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-primary uppercase shadow-sm">
                      {tournament.status === 'OPEN_FOR_REGISTRATION' ? 'Abertas' : 'Encerrado'}
                    </div>
                  </div>
                  
                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-primary transition-colors">
                      {tournament.name}
                    </h3>
                    
                    <div className="space-y-3 mb-6 flex-1">
                      <div className="flex items-center gap-3 text-gray-500 text-sm">
                        <Calendar size={16} className="text-orange-500" />
                        {formatDate(tournament.startDate)}
                      </div>
                      <div className="flex items-center gap-3 text-gray-500 text-sm">
                        <MapPin size={16} className="text-orange-500" />
                        {tournament.location}
                      </div>
                      <div className="flex items-center gap-3 text-gray-500 text-sm">
                        <Users size={16} className="text-orange-500" />
                        {tournament.categories.length > 0 ? tournament.categories.join(", ") + "..." : "Várias categorias"}
                      </div>
                    </div>

                    <Link 
                      href={`/torneios/${tournament.slug}`}
                      className="w-full block text-center py-3 border border-primary text-primary font-bold rounded-lg hover:bg-primary hover:text-white transition-all"
                    >
                      Inscrever-se
                    </Link>
                  </div>
                </div>
              ))}

              {/* Card "Em Breve" / Genérico */}
              <div className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-4">
                  <Calendar size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-700 mb-2">Mais torneios em breve</h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">
                  Fique ligado para novas etapas e competições.
                </p>
                <Link href="/torneios" className="text-primary font-medium hover:underline text-sm">
                  Ver calendário completo
                </Link>
              </div>
            </div>

            <div className="mt-8 text-center md:hidden">
              <Link href="/torneios" className="inline-flex items-center gap-2 text-primary font-bold">
                Ver todos os torneios <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* Features / Diferenciais */}
        <section className="py-20 bg-white border-t border-gray-100">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <span className="text-primary font-bold tracking-wider text-sm uppercase">Diferenciais</span>
              <h2 className="text-3xl font-bold text-gray-900 mt-2">Tudo que você precisa para competir</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-12">
              {[
                {
                  title: "Gestão Completa",
                  desc: "Do momento da inscrição até a entrega do troféu, tudo digital e transparente.",
                  icon: "⚡"
                },
                {
                  title: "Chaves Automáticas",
                  desc: "Acompanhe seu próximo jogo, quadra e horário em tempo real pelo celular.",
                  icon: "📱"
                },
                {
                  title: "Histórico Unificado",
                  desc: "Todos os seus resultados e pontos salvos em um único perfil de atleta.",
                  icon: "�"
                }
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6 shadow-sm rotate-3 hover:rotate-0 transition-transform">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-gray-900">{item.title}</h3>
                  <p className="text-gray-500 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-white py-12 border-t border-gray-800">
        <div className="container mx-auto px-4 grid md:grid-cols-4 gap-8">
          <div>
            <span className="text-xl font-bold mb-4 block text-white">Beach<span className="text-orange-500">Tennis</span>Manager</span>
            <p className="text-gray-400 text-sm">
              Plataforma líder em gestão de torneios de Beach Tennis. Simplificando a vida de organizadores e atletas.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-gray-200">Plataforma</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/torneios" className="hover:text-white transition-colors">Torneios</Link></li>
              <li><Link href="/ranking" className="hover:text-white transition-colors">Ranking</Link></li>
              <li><Link href="/login" className="hover:text-white transition-colors">Área do Atleta</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-gray-200">Legal</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link></li>
              <li><Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-gray-200">Contato</h4>
            <p className="text-sm text-gray-400 mb-2">suporte@beachtennis.com.br</p>
            <div className="flex gap-4 mt-4">
              <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center hover:bg-primary transition-colors cursor-pointer">IG</div>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 mt-12 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Beach Tennis Manager. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
