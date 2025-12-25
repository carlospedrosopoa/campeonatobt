"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, X, Check } from "lucide-react";
import { createCategory, deleteCategory } from "@/app/actions/categories";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
  price: string;
  maxPairs: number | null;
}

export function CategoriesManager({ 
  tournamentId, 
  initialCategories 
}: { 
  tournamentId: string; 
  initialCategories: Category[] 
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  // New Category State
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("100");
  const [newMaxPairs, setNewMaxPairs] = useState("32");

  const handleAdd = async () => {
    if (!newName) return;
    setLoading(true);

    const res = await createCategory({
      tournamentId,
      name: newName,
      price: parseFloat(newPrice),
      maxPairs: parseInt(newMaxPairs),
    });

    if (res.success) {
      setIsAdding(false);
      setNewName("");
      // Refresh simples para pegar dados atualizados do server
      router.refresh(); 
      // Em app real otimizado, atualizaríamos o state local optimisticamente ou via retorno da action
    } else {
      alert(res.message);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza?")) return;
    const res = await deleteCategory(id);
    if (res.success) {
      router.refresh();
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-gray-900">Categorias ({categories.length})</h3>
        <button 
          onClick={() => setIsAdding(true)}
          className="text-sm flex items-center gap-1 text-primary hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
        >
          <Plus size={16} /> Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {/* Form de Adicionar */}
        {isAdding && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex flex-col md:flex-row gap-3 items-end md:items-center animate-in fade-in slide-in-from-top-2">
            <div className="flex-1">
              <label className="text-xs text-blue-700 font-bold ml-1">Nome</label>
              <input 
                type="text" 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Mista C"
                className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-blue-700 font-bold ml-1">Preço (R$)</label>
              <input 
                type="number" 
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-blue-700 font-bold ml-1">Vagas</label>
              <input 
                type="number" 
                value={newMaxPairs}
                onChange={(e) => setNewMaxPairs(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex gap-1">
              <button 
                onClick={handleAdd}
                disabled={loading}
                className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Check size={18} />
              </button>
              <button 
                onClick={() => setIsAdding(false)}
                className="p-2 bg-white text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        {categories.length === 0 && !isAdding && (
           <p className="text-gray-400 text-sm text-center py-4 italic">Nenhuma categoria cadastrada.</p>
        )}

        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-300 transition-colors group bg-white">
            <div className="flex items-center gap-4">
              <span className="font-bold text-gray-800">{cat.name}</span>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="bg-gray-100 px-2 py-0.5 rounded">R$ {cat.price}</span>
                <span className="bg-gray-100 px-2 py-0.5 rounded">{cat.maxPairs || 0} vagas</span>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => handleDelete(cat.id)}
                className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
                title="Excluir"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
