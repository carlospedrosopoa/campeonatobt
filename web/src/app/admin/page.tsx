import Link from "next/link";
import { CalendarPlus, List, UserPlus } from "lucide-react";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const session = await getSession();
  const isAdmin = session?.user?.perfil === "ADMIN";

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

        {isAdmin && (
          <Link
            href="/admin/configuracoes/organizadores"
            className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Cadastrar organizer</div>
                <div className="text-sm text-slate-600">Crie usuários organizadores para administrar torneios específicos.</div>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
