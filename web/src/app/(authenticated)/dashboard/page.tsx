import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, Calendar, User, LogOut } from "lucide-react";
import { db } from "@/db";
import { registrations, tournaments, categories } from "@/db/schema";
import { eq, or, desc, and } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { user } = session;

  // Buscar inscrições do usuário (como player 1 ou player 2)
  // SELECT * FROM registrations WHERE player1Id = user.id OR player2Id = user.id
  // Drizzle ORM:
  const userRegistrations = await db
    .select({
      id: registrations.id,
      status: registrations.status,
      categoryName: categories.name,
      tournamentName: tournaments.name,
      tournamentDate: tournaments.startDate,
    })
    .from(registrations)
    .leftJoin(categories, eq(registrations.categoryId, categories.id))
    .leftJoin(tournaments, eq(categories.tournamentId, tournaments.id))
    .where(
      or(
        eq(registrations.player1Id, user.id),
        eq(registrations.player2Id, user.id)
      )
    )
    .orderBy(desc(registrations.createdAt));

  // Calcular estatísticas
  const totalTournaments = userRegistrations.length;
  const lastCategory = userRegistrations.length > 0 ? userRegistrations[0].categoryName : "N/A";
  const points = user.points || 0; // Se tiver no session ou buscar do banco users

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">Área do Atleta</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden md:inline">Olá, <strong>{user.name}</strong></span>
            <form action="/api/auth/logout" method="POST">
               <button type="submit" className="text-red-500 hover:text-red-700 p-2">
                 <LogOut size={20} />
               </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Meu Painel</h1>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Stats Cards */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Trophy size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pontuação Ranking</p>
              <h3 className="text-2xl font-bold text-gray-900">{points} pts</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
              <Calendar size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inscrições</p>
              <h3 className="text-2xl font-bold text-gray-900">{totalTournaments}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <User size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Última Categoria</p>
              <h3 className="text-2xl font-bold text-gray-900">{lastCategory || '-'}</h3>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Próximos Torneios</h2>
              <Link href="/torneios" className="text-primary text-sm hover:underline">Ver todos</Link>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
               <div className="p-8 text-center text-gray-500">
                 <p>Veja o calendário completo para se inscrever.</p>
                 <Link href="/torneios" className="mt-4 inline-block px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-900 transition-colors">
                   Explorar Calendário
                 </Link>
               </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Minhas Inscrições</h2>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
               {userRegistrations.length > 0 ? (
                 <ul className="divide-y divide-gray-100">
                   {userRegistrations.map((reg) => (
                     <li key={reg.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                       <div>
                         <p className="font-bold text-gray-800">{reg.tournamentName}</p>
                         <p className="text-sm text-gray-500">{reg.categoryName}</p>
                       </div>
                       <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                         reg.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                         reg.status === 'PAID' ? 'bg-blue-100 text-blue-700' :
                         'bg-yellow-100 text-yellow-700'
                       }`}>
                         {reg.status}
                       </span>
                     </li>
                   ))}
                 </ul>
               ) : (
                 <div className="p-8 text-center text-gray-500">
                   <p>Você ainda não está inscrito em nenhum torneio.</p>
                 </div>
               )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
