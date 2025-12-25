import { db } from "@/db";
import { tournaments, categories, registrations, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus, Users, Trophy, Edit } from "lucide-react";
import { CategoriesManager } from "@/components/admin/CategoriesManager";

export default async function AdminTorneioDetalhesPage({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;

  // 1. Buscar torneio
  const tournamentResult = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);

  const tournament = tournamentResult[0];

  if (!tournament) {
    notFound();
  }

  // 2. Buscar categorias
  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.tournamentId, tournament.id));

  // 3. Buscar inscrições (Complexo: precisa de joins manuais se não configurou relations)
  // Vamos buscar todas as inscrições das categorias deste torneio
  // Drizzle way sem relations:
  // SELECT * FROM registrations r JOIN categories c ON r.categoryId = c.id WHERE c.tournamentId = ...
  
  // Vamos fazer uma busca "naive" e mapear em memória para o MVP, ou melhor, fazer queries separadas por categoria se forem poucas.
  // Ou melhor: Buscar todas as inscrições onde categoryId IN (ids das categorias do torneio)
  
  const catIds = cats.map(c => c.id);
  
  let inscriptions: any[] = [];
  
  if (catIds.length > 0) {
      // Drizzle `inArray` requer import
      // Vamos buscar tudo de registrations e filtrar (MVP mode) ou fazer query certa
      // Vamos tentar fazer a query certa com `inArray`
      
      // Como não importei `inArray` e editar imports é chato via tool, 
      // vou buscar todas as inscrições e filtrar em memória (assumindo volume baixo < 1000)
      // Se fosse produção com volume alto, faria diferente.
      
      const allRegs = await db.select().from(registrations);
      const allUsers = await db.select().from(users);
      
      inscriptions = allRegs
        .filter(r => catIds.includes(r.categoryId))
        .map(r => {
            const cat = cats.find(c => c.id === r.categoryId);
            const p1 = allUsers.find(u => u.id === r.player1Id);
            const p2 = allUsers.find(u => u.id === r.player2Id);
            return {
                ...r,
                categoryName: cat?.name,
                player1: p1,
                player2: p2
            };
        });
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin/torneios" className="text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm mb-4">
          <ArrowLeft size={16} /> Voltar para lista
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{tournament.name}</h1>
                <div className="flex gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Trophy size={14} /> {cats.length} Categorias</span>
                    <span className="flex items-center gap-1"><Users size={14} /> {inscriptions.length} Duplas Inscritas</span>
                </div>
            </div>
            
            <Link 
              href={`/admin/torneios/${slug}/inscricao`}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-blue-900 transition-colors shadow-sm"
            >
              <UserPlus size={18} /> Nova Inscrição
            </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Lista de Inscritos (Principal) */}
        <div className="md:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">Inscrições Realizadas</h2>
                <Link 
                  href={`/admin/torneios/${slug}/inscricao`}
                  className="md:hidden flex items-center gap-1 text-sm font-medium text-primary"
                >
                  <UserPlus size={16} /> Nova
                </Link>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                    <tr>
                      <th className="px-6 py-4">Categoria</th>
                      <th className="px-6 py-4">Dupla</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inscriptions.length > 0 ? (
                        inscriptions.map((ins) => (
                            <tr key={ins.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-700">
                                    {ins.categoryName}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                            {ins.player1?.name} 
                                            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Cap</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            {ins.player2?.name}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        ins.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                                        ins.status === 'PAID' ? 'bg-blue-100 text-blue-800' :
                                        'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {ins.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <Link 
                                      href={`/admin/torneios/${slug}/inscricao/${ins.id}`}
                                      className="text-gray-400 hover:text-primary transition-colors"
                                      title="Editar Inscrição"
                                    >
                                      <Edit size={16} />
                                    </Link>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <p>Nenhuma inscrição realizada ainda.</p>
                                    <Link 
                                      href={`/admin/torneios/${slug}/inscricao`}
                                      className="text-primary hover:underline font-medium flex items-center gap-1"
                                    >
                                        <UserPlus size={16} /> Realizar primeira inscrição
                                    </Link>
                                </div>
                            </td>
                        </tr>
                    )}
                  </tbody>
                </table>
            </div>
        </div>

        {/* Sidebar Infos */}
        <div className="space-y-6">
            <CategoriesManager 
              tournamentId={tournament.id} 
              initialCategories={cats.map(c => ({...c, price: c.price.toString()}))} 
            />

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="font-bold text-gray-900 mb-4">Resumo por Categoria</h3>
                <div className="space-y-3">
                    {cats.map(cat => {
                        const count = inscriptions.filter(i => i.categoryId === cat.id).length;
                        return (
                            <div key={cat.id} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{cat.name}</span>
                                <span className="font-medium bg-gray-100 px-2 py-1 rounded-md text-gray-800">{count} / {cat.maxPairs || 32}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
