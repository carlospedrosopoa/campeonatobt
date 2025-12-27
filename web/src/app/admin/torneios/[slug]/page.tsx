"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Users, Trophy, Edit, Loader2 } from "lucide-react";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { SponsorsManager } from "@/components/admin/SponsorsManager";
import { useParams } from "next/navigation";
import { generateGroupMatches } from "@/app/actions/matches";
import { Play } from "lucide-react";

interface Tournament {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
}

interface Category {
  id: string;
  name: string;
  price: number;
  maxPairs: number;
}

interface Sponsor {
  id: string;
  name: string;
  address: string | null;
  instagram: string | null;
  website: string | null;
  logoUrl: string | null;
}

interface Registration {
  id: string;
  categoryId: string;
  player1: { name: string };
  player2: { name: string };
  categoryName: string;
  status: string;
}

export default function AdminTorneioDetalhesPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    tournament: Tournament;
    categories: Category[];
    inscriptions: Registration[];
    sponsors: Sponsor[];
  } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/tournaments/${slug}/details`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          console.error("Failed to fetch tournament details");
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-bold text-gray-800">Torneio não encontrado</h2>
        <Link href="/admin/torneios" className="text-primary hover:underline">
          Voltar para lista
        </Link>
      </div>
    );
  }

  const { tournament, categories, inscriptions, sponsors } = data;

  const handleGenerateMatches = async (categoryId: string) => {
    if (!confirm("Isso irá APAGAR os jogos existentes desta fase e gerar novos grupos. Confirmar?")) return;
    
    setLoading(true);
    const res = await generateGroupMatches(categoryId, 4); // Default group size 4
    if (res.success) {
      alert(res.message);
      // Recarregar dados
      window.location.reload();
    } else {
      alert(res.message);
      setLoading(false);
    }
  };

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
                    <span className="flex items-center gap-1"><Trophy size={14} /> {categories.length} Categorias</span>
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
                      <th className="px-6 py-4 text-right">Ações</th>
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
              initialCategories={categories.map(c => ({...c, price: c.price.toString()}))} 
            />

            <SponsorsManager 
              tournamentId={tournament.id}
              initialSponsors={sponsors || []}
            />

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="font-bold text-gray-900 mb-4">Resumo por Categoria</h3>
                <div className="space-y-3">
                    {categories.map(cat => {
                        const count = inscriptions.filter(i => i.categoryId === cat.id).length;
                        return (
                            <div key={cat.id} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{cat.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium bg-gray-100 px-2 py-1 rounded-md text-gray-800">{count} / {cat.maxPairs || 32}</span>
                                  {count >= 2 && (
                                      <button 
                                        onClick={() => handleGenerateMatches(cat.id)}
                                        className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                                        title="Gerar Grupos e Jogos"
                                      >
                                          <Play size={14} />
                                      </button>
                                  )}
                                </div>
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
