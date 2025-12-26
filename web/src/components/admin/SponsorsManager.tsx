"use client";

import { useState } from "react";
import { Plus, Trash2, X, Check, Globe, Instagram, MapPin } from "lucide-react";
import { createSponsor, deleteSponsor } from "@/app/actions/sponsors";
import { useRouter } from "next/navigation";

interface Sponsor {
  id: string;
  name: string;
  address: string | null;
  instagram: string | null;
  website: string | null;
  logoUrl: string | null;
}

export function SponsorsManager({ 
  tournamentId, 
  initialSponsors 
}: { 
  tournamentId: string; 
  initialSponsors: Sponsor[] 
}) {
  const router = useRouter();
  const [sponsors, setSponsors] = useState(initialSponsors);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newInstagram, setNewInstagram] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");

  const handleAdd = async () => {
    if (!newName) return;
    setLoading(true);

    const res = await createSponsor({
      tournamentId,
      name: newName,
      address: newAddress,
      instagram: newInstagram,
      website: newWebsite,
      logoUrl: newLogoUrl,
    });

    if (res.success) {
      setIsAdding(false);
      setNewName("");
      setNewAddress("");
      setNewInstagram("");
      setNewWebsite("");
      setNewLogoUrl("");
      router.refresh(); 
      // Em app real, idealmente atualizariamos o estado local ou usariamos React Query/SWR
      // Como estamos com refresh manual no client side page, talvez precise recarregar a pagina pai
      // Mas o router.refresh() deve funcionar se o componente pai for server ou usar router.refresh
      // No nosso caso atual (page.tsx virou client), o router.refresh() re-executa os server components, 
      // mas como a pagina é client e busca dados via fetch no useEffect, precisamos avisar pra recarregar.
      window.location.reload(); // Fallback simples para MVP
    } else {
      alert(res.message);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este apoiador?")) return;
    const res = await deleteSponsor(id);
    if (res.success) {
      window.location.reload();
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-gray-900">Apoiadores ({sponsors.length})</h3>
        <button 
          onClick={() => setIsAdding(true)}
          className="text-sm flex items-center gap-1 text-primary hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
        >
          <Plus size={16} /> Adicionar
        </button>
      </div>

      <div className="space-y-4">
        {/* Form de Adicionar */}
        {isAdding && (
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
            <div>
              <label className="text-xs text-blue-700 font-bold ml-1">Nome do Apoiador</label>
              <input 
                type="text" 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Arena Beach"
                className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-blue-700 font-bold ml-1">Instagram</label>
                    <input 
                        type="text" 
                        value={newInstagram}
                        onChange={(e) => setNewInstagram(e.target.value)}
                        placeholder="@instagram"
                        className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
                    />
                </div>
                <div>
                    <label className="text-xs text-blue-700 font-bold ml-1">Site</label>
                    <input 
                        type="text" 
                        value={newWebsite}
                        onChange={(e) => setNewWebsite(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
                    />
                </div>
            </div>

            <div>
              <label className="text-xs text-blue-700 font-bold ml-1">Endereço</label>
              <input 
                type="text" 
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Rua Exemplo, 123"
                className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>

             <div>
              <label className="text-xs text-blue-700 font-bold ml-1">URL da Logo</label>
              <input 
                type="text" 
                value={newLogoUrl}
                onChange={(e) => setNewLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>

            <div className="flex gap-2 justify-end mt-2">
              <button 
                onClick={() => setIsAdding(false)}
                className="px-3 py-2 bg-white text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 text-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={handleAdd}
                disabled={loading}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-1"
              >
                <Check size={16} /> Salvar
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        {sponsors.length === 0 && !isAdding && (
           <p className="text-gray-400 text-sm text-center py-4 italic">Nenhum apoiador cadastrado.</p>
        )}

        {sponsors.map((sponsor) => (
          <div key={sponsor.id} className="flex items-start justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-300 transition-colors group bg-white">
            <div className="flex items-center gap-3">
              {sponsor.logoUrl ? (
                  <img src={sponsor.logoUrl} alt={sponsor.name} className="w-10 h-10 rounded-full object-cover border border-gray-100" />
              ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold">
                      {sponsor.name.substring(0, 2).toUpperCase()}
                  </div>
              )}
              
              <div>
                  <h4 className="font-bold text-gray-800 text-sm">{sponsor.name}</h4>
                  <div className="flex flex-col gap-0.5 text-xs text-gray-500 mt-0.5">
                    {sponsor.address && <span className="flex items-center gap-1"><MapPin size={10} /> {sponsor.address}</span>}
                    <div className="flex gap-2">
                        {sponsor.instagram && <a href={sponsor.instagram} target="_blank" className="flex items-center gap-1 hover:text-blue-600"><Instagram size={10} /> Insta</a>}
                        {sponsor.website && <a href={sponsor.website} target="_blank" className="flex items-center gap-1 hover:text-blue-600"><Globe size={10} /> Site</a>}
                    </div>
                  </div>
              </div>
            </div>

            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => handleDelete(sponsor.id)}
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
