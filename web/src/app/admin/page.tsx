import { db } from "@/db";
import { tournaments, users, registrations } from "@/db/schema";
import { count } from "drizzle-orm";
import { Trophy, Users, ClipboardList, Activity } from "lucide-react";

export default async function AdminDashboard() {
  // Estatísticas Rápidas (Counts)
  const [tournamentsCount] = await db.select({ value: count() }).from(tournaments);
  const [usersCount] = await db.select({ value: count() }).from(users);
  const [registrationsCount] = await db.select({ value: count() }).from(registrations);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-8">Visão Geral</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Trophy size={24} />
            </div>
            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">+2 este mês</span>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 mb-1">{tournamentsCount.value}</h3>
          <p className="text-gray-500 text-sm">Torneios Cadastrados</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
              <Users size={24} />
            </div>
            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">+12 hoje</span>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 mb-1">{usersCount.value}</h3>
          <p className="text-gray-500 text-sm">Atletas Registrados</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <ClipboardList size={24} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 mb-1">{registrationsCount.value}</h3>
          <p className="text-gray-500 text-sm">Inscrições Totais</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <Activity size={24} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-gray-900 mb-1">Ativo</h3>
          <p className="text-gray-500 text-sm">Status do Sistema</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Atividade Recente</h2>
          <div className="space-y-4">
            <p className="text-gray-500 text-sm text-center py-8">Nenhuma atividade recente para exibir.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Ações Rápidas</h2>
          <div className="grid grid-cols-2 gap-4">
            <button className="p-4 border border-dashed border-gray-300 rounded-lg hover:border-primary hover:bg-blue-50 hover:text-primary transition-all text-sm font-medium text-gray-600 flex flex-col items-center justify-center gap-2">
              <Trophy size={20} /> Novo Torneio
            </button>
            <button className="p-4 border border-dashed border-gray-300 rounded-lg hover:border-primary hover:bg-blue-50 hover:text-primary transition-all text-sm font-medium text-gray-600 flex flex-col items-center justify-center gap-2">
              <Users size={20} /> Cadastrar Atleta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
