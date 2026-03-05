import Link from "next/link";
import { CalendarPlus, List } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Painel Administrativo</h1>
          <p className="text-sm text-slate-600">Gerencie torneios, categorias, inscrições e partidas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/torneios/novo"
          className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <CalendarPlus className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Criar torneio</div>
              <div className="text-sm text-slate-600">Cadastre um novo evento e publique quando estiver pronto.</div>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/torneios"
          className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <List className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Lista de torneios</div>
              <div className="text-sm text-slate-600">Edite eventos existentes e acompanhe o status.</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

