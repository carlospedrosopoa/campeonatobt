import Link from "next/link";
import { Trophy, Settings, List } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;
  const permitido = perfil === "ADMIN" || perfil === "ORGANIZADOR";

  if (!permitido) {
    redirect(`/login?next=${encodeURIComponent("/admin")}`);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          <aside className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 h-fit lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Trophy className="h-5 w-5 text-orange-500" />
                Admin
              </div>
              <Link href="/" className="text-xs text-slate-600 hover:text-slate-900">
                Ver site
              </Link>
            </div>

            <nav className="pt-4 space-y-1 text-sm">
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-50 text-slate-700"
              >
                <Settings className="h-4 w-4 text-slate-500" />
                Painel
              </Link>
              <Link
                href="/admin/torneios"
                className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-50 text-slate-700"
              >
                <List className="h-4 w-4 text-slate-500" />
                Torneios
              </Link>
            </nav>
          </aside>

          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
