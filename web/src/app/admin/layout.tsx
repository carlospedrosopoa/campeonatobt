import Link from "next/link";
import { Trophy, Settings, List } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;
  const permitido = perfil === "ADMIN" || perfil === "ORGANIZADOR";
  const isAdmin = perfil === "ADMIN";

  if (!permitido) {
    redirect(`/login?next=${encodeURIComponent("/admin")}`);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:py-8">
        <div className="lg:hidden">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50">
                  <Trophy className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <div className="text-sm leading-none">Admin</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">Acesso rapido no celular</div>
                </div>
              </div>
              <Link href="/" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                Ver site
              </Link>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link
                href="/admin"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700"
              >
                <Settings className="h-4 w-4 text-slate-500" />
                Painel
              </Link>
              <Link
                href="/admin/torneios"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700"
              >
                <List className="h-4 w-4 text-slate-500" />
                Torneios
              </Link>
              {isAdmin && (
                <Link
                  href="/admin/configuracoes"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700"
                >
                  <Settings className="h-4 w-4 text-slate-500" />
                  Configurações
                </Link>
              )}
            </nav>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-0 lg:grid-cols-[260px_1fr] lg:gap-8">
          <aside className="hidden h-fit rounded-xl border border-slate-100 bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:block">
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
              {isAdmin && (
                <Link
                  href="/admin/configuracoes"
                  className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-50 text-slate-700"
                >
                  <Settings className="h-4 w-4 text-slate-500" />
                  Configurações
                </Link>
              )}
            </nav>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
