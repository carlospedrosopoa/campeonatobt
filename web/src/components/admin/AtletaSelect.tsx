"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Command } from "cmdk";
import { searchAtletas, type ExternalUser } from "@/app/actions/atletas";

interface AtletaSelectProps {
  label: string;
  onSelect: (user: ExternalUser) => void;
  selectedUser?: ExternalUser | null;
}

export function AtletaSelect({ label, onSelect, selectedUser }: AtletaSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<ExternalUser[]>([]);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 3) {
        setLoading(true);
        try {
          const data = await searchAtletas(query);
          setResults(data);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <div 
           className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg flex items-center justify-between cursor-pointer hover:border-primary transition-colors"
           onClick={() => setOpen(!open)}
        >
           {selectedUser ? (
             <span className="font-medium text-gray-900">{selectedUser.name}</span>
           ) : (
             <span className="text-gray-400">Buscar atleta...</span>
           )}
           <ChevronsUpDown className="w-4 h-4 text-gray-400 opacity-50" />
        </div>

        {open && (
           <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
             <div className="p-2 border-b border-gray-100">
               <input 
                 type="text" 
                 className="w-full px-3 py-2 bg-gray-50 rounded-md outline-none text-sm"
                 placeholder="Digite nome ou email..."
                 value={query}
                 onChange={(e) => setQuery(e.target.value)}
                 autoFocus
               />
             </div>
             
             <div className="max-h-60 overflow-y-auto p-1">
               {loading && (
                 <div className="flex items-center justify-center py-4 text-gray-500">
                   <Loader2 className="w-4 h-4 animate-spin mr-2" /> Buscando...
                 </div>
               )}
               
               {!loading && results.length === 0 && query.length >= 3 && (
                 <div className="text-center py-4 text-gray-500 text-sm">
                   Nenhum atleta encontrado.
                 </div>
               )}

               {!loading && query.length < 3 && (
                 <div className="text-center py-4 text-gray-400 text-sm">
                   Digite pelo menos 3 caracteres
                 </div>
               )}

               {results.map((user) => (
                 <div
                   key={user.id}
                   className="flex items-center px-3 py-2 cursor-pointer hover:bg-blue-50 rounded-md transition-colors"
                   onClick={() => {
                     onSelect(user);
                     setOpen(false);
                     setQuery("");
                   }}
                 >
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3 text-xs font-bold text-gray-600">
                        {user.name.charAt(0)}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    {selectedUser?.id === user.id && (
                        <Check className="ml-auto w-4 h-4 text-primary" />
                    )}
                 </div>
               ))}
             </div>
           </div>
        )}
      </div>
    </div>
  );
}
