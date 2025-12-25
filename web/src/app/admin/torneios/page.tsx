import { db } from "@/db";
import { tournaments, registrations } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";
import Link from "next/link";
import { Plus, Calendar, MapPin, Users } from "lucide-react";

export default async function AdminTorneiosPage() {
  const allTournaments = await db
    .select()
    .from(tournaments)
    .orderBy(desc(tournaments.startDate));

  // Buscar contagem de inscritos para cada torneio (query separada para simplificar)
  // Idealmente faria um join e group by
  const tournamentsWithCounts = await Promise.all(
    allTournaments.map(async (t) => {
        // Isso não é super performático N+1, mas para MVP admin serve
        // Join seria melhor: select t.*, count(r.id) from tournaments t left join categories c on c.tournamentId = t.id left join registrations r on r.categoryId = c.id group by t.id
        // Mas o drizzle requer setup cuidadoso de relations para isso.
        // Vamos manter simples.
        
        // Na verdade, precisamos ir via categorias.
        // Vamos simplificar: mostrar só lista por enquanto, depois melhoramos a count.
        return t;
    })
  );

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Meus Torneios</h1>
        <Link 
          href="/admin/torneios/novo" 
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-900 transition-colors font-medium text-sm"
        >
          <Plus size={16} /> Novo Torneio
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
              <th className="px-6 py-4">Nome do Evento</th>
              <th className="px-6 py-4">Data</th>
              <th className="px-6 py-4">Local</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allTournaments.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-400">Slug: {t.slug}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400" />
                    {formatDate(t.startDate)}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-gray-400" />
                    {t.location}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    t.status === 'OPEN_FOR_REGISTRATION' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {t.status === 'OPEN_FOR_REGISTRATION' ? 'Aberto' : t.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Link 
                    href={`/admin/torneios/${t.slug}`} 
                    className="text-primary hover:text-blue-800 font-medium text-sm"
                  >
                    Gerenciar
                  </Link>
                </td>
              </tr>
            ))}
            
            {allTournaments.length === 0 && (
                <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        Nenhum torneio encontrado.
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
