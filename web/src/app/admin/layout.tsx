import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, Users, Calendar, LayoutDashboard, LogOut } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Proteção básica: Se não logado ou não for admin/organizer, tchau.
  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "ORGANIZER") {
    // Se for player tentando acessar admin, manda pro dashboard dele
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-20">
        <div className="p-6 border-b border-slate-800">
          <span className="text-xl font-bold text-white tracking-tight">
            BT<span className="text-orange-500">Manager</span> <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full ml-1">Admin</span>
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link 
            href="/admin" 
            className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
          >
            <LayoutDashboard size={20} />
            Dashboard
          </Link>
          
          <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Gestão
          </div>
          
          <Link 
            href="/admin/torneios" 
            className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
          >
            <Trophy size={20} />
            Torneios
          </Link>

          <Link 
            href="/admin/atletas" 
            className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
          >
            <Users size={20} />
            Atletas
          </Link>

          <Link 
            href="/admin/agenda" 
            className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
          >
            <Calendar size={20} />
            Agenda / Quadras
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-800">
           <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold">
                 {session.user.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                 <p className="text-sm font-medium text-white truncate">{session.user.name}</p>
                 <p className="text-xs text-slate-400 truncate">{session.user.role}</p>
              </div>
           </div>
           <form action="/api/auth/logout" method="POST">
             <button type="submit" className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-400 hover:bg-slate-800 rounded-lg transition-colors text-sm">
               <LogOut size={16} /> Sair
             </button>
           </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        {children}
      </main>
    </div>
  );
}
