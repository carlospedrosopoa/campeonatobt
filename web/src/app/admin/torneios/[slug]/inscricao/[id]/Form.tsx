"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtletaSelect } from "@/components/admin/AtletaSelect";
import { importAtleta, type ExternalUser } from "@/app/actions/atletas";
import { Loader2, ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";

interface Props {
  registration: any;
  tournament: any;
  categories: any[];
  slug: string;
}

export function EdicaoInscricaoForm({ registration, tournament, categories, slug }: Props) {
  const router = useRouter();
  
  // Converter user db para ExternalUser
  const toExternalUser = (u: any): ExternalUser => ({
    id: u.playnaquadraId || u.id, // Preferencia ID externo para busca visual, mas ID interno é o que vale no db
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl
  });

  const [player1, setPlayer1] = useState<ExternalUser | null>(registration.player1 ? toExternalUser(registration.player1) : null);
  const [player2, setPlayer2] = useState<ExternalUser | null>(registration.player2 ? toExternalUser(registration.player2) : null);
  const [selectedCategory, setSelectedCategory] = useState<string>(registration.categoryId);
  const [status, setStatus] = useState<string>(registration.status);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player1 || !player2 || !selectedCategory) {
      setMessage("Preencha todos os campos.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      // 1. Importar/Sincronizar Atletas (garante que dados novos de busca sejam salvos)
      const p1 = await importAtleta(player1);
      const p2 = await importAtleta(player2);

      // 2. Atualizar Inscrição
      const res = await fetch(`/api/admin/registrations/${registration.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategory,
          player1Id: p1.id,
          player2Id: p2.id,
          status: status
        }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar inscrição");

      setMessage("Inscrição atualizada com sucesso!");
      router.refresh();
      setTimeout(() => {
        router.push(`/admin/torneios/${slug}`);
      }, 1000);

    } catch (error) {
      console.error(error);
      setMessage("Erro ao atualizar inscrição.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if(!confirm("Tem certeza que deseja EXCLUIR esta inscrição?")) return;
    
    setLoading(true);
    try {
        const res = await fetch(`/api/admin/registrations/${registration.id}`, {
            method: "DELETE"
        });
        if (!res.ok) throw new Error("Erro ao excluir");
        
        router.push(`/admin/torneios/${slug}`);
    } catch(e) {
        alert("Erro ao excluir inscrição");
        setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <div className="mb-8 flex justify-between items-start">
        <div>
            <Link href={`/admin/torneios/${slug}`} className="text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm mb-4">
            <ArrowLeft size={16} /> Voltar
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Editar Inscrição</h1>
            <p className="text-gray-500">{tournament.name}</p>
        </div>
        <button 
            onClick={handleDelete}
            className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
            title="Excluir Inscrição"
        >
            <Trash2 size={20} />
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.includes("sucesso") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleUpdate} className="space-y-6">
        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          >
            <option value="PENDING">Pendente</option>
            <option value="APPROVED">Aprovado (Aguardando Pagamento)</option>
            <option value="PAID">Pago / Confirmado</option>
            <option value="REJECTED">Rejeitado / Cancelado</option>
          </select>
        </div>

        {/* Seleção de Categoria */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            required
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} - R$ {cat.price}
              </option>
            ))}
          </select>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <AtletaSelect 
            label="Atleta 1 (Capitão)" 
            onSelect={setPlayer1} 
            selectedUser={player1} 
          />
          
          <AtletaSelect 
            label="Atleta 2 (Parceiro)" 
            onSelect={setPlayer2} 
            selectedUser={player2} 
          />
        </div>

        <div className="pt-4 border-t border-gray-100 mt-6">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-primary text-white font-bold rounded-xl hover:bg-blue-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Salvar Alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}
