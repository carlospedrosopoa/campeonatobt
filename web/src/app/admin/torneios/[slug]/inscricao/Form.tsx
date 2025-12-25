"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtletaSelect } from "@/components/admin/AtletaSelect";
import { importAtleta, type ExternalUser } from "@/app/actions/atletas";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Props {
  tournament: any;
  categories: any[];
  slug: string;
}

export function InscricaoForm({ tournament, categories, slug }: Props) {
  const router = useRouter();
  
  const [player1, setPlayer1] = useState<ExternalUser | null>(null);
  const [player2, setPlayer2] = useState<ExternalUser | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player1 || !player2 || !selectedCategory) {
      setMessage("Preencha todos os campos.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      // 1. Importar/Sincronizar Atletas
      const p1 = await importAtleta(player1);
      const p2 = await importAtleta(player2);

      // 2. Criar Inscrição (via API Route para simplificar)
      const res = await fetch("/api/admin/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategory,
          player1Id: p1.id,
          player2Id: p2.id,
          status: "APPROVED", // Admin já aprova direto
          paymentStatus: "PAID" // Assumimos pago se admin inscreveu (ou pending)
        }),
      });

      if (!res.ok) throw new Error("Erro ao criar inscrição");

      setMessage("Inscrição realizada com sucesso!");
      // Limpar form ou redirecionar
      setTimeout(() => {
        router.push(`/admin/torneios/${slug}`);
      }, 1500);

    } catch (error) {
      console.error(error);
      setMessage("Erro ao processar inscrição.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <div className="mb-8">
        <Link href="/admin/torneios" className="text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm mb-4">
          <ArrowLeft size={16} /> Voltar
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nova Inscrição Manual</h1>
        <p className="text-gray-500">{tournament.name}</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.includes("sucesso") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seleção de Categoria */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            required
          >
            <option value="">Selecione uma categoria...</option>
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
          <div className="flex items-center justify-between mb-6 bg-gray-50 p-4 rounded-lg">
             <span className="font-medium text-gray-700">Total a Pagar</span>
             <span className="text-xl font-bold text-green-600">
               {selectedCategory 
                 ? `R$ ${categories.find(c => c.id === selectedCategory)?.price}` 
                 : "R$ 0,00"}
             </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-primary text-white font-bold rounded-xl hover:bg-blue-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Confirmar Inscrição"}
          </button>
        </div>
      </form>
    </div>
  );
}
