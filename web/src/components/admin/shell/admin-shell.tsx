"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ChevronRight, ExternalLink, LogOut, Menu as MenuIcon, Search, X } from "lucide-react";
import { Menu } from "@/components/admin/ui";
import { CommandPalette } from "./command-palette";
import { ABAS_CATEGORIA, SECOES_TORNEIO, interpretarRota } from "./rotas";
import { SidebarConteudo } from "./sidebar";
import { useTorneioContexto, type TorneioContexto } from "./use-torneio-contexto";

type Usuario = { nome: string | null; perfil: string | null };

type Migalha = { label: string; href?: string };

function montarMigalhas(pathname: string, contexto: TorneioContexto | null): Migalha[] {
  const rota = interpretarRota(pathname);
  if (pathname === "/admin") return [{ label: "Painel" }];
  if (pathname.startsWith("/admin/configuracoes")) {
    const m: Migalha[] = [{ label: "Configurações", href: "/admin/configuracoes" }];
    if (pathname.startsWith("/admin/configuracoes/organizadores")) {
      m.push({ label: "Organizadores", href: "/admin/configuracoes/organizadores" });
      if (pathname.endsWith("/novo")) m.push({ label: "Novo" });
      else if (pathname.split("/").length > 4) m.push({ label: "Editar" });
    }
    return m;
  }
  const m: Migalha[] = [{ label: "Torneios", href: "/admin/torneios" }];
  if (pathname === "/admin/torneios/novo") return [...m, { label: "Novo torneio" }];
  if (!rota.slug) return m;

  const base = `/admin/torneios/${rota.slug}`;
  m.push({ label: contexto?.torneio?.nome ?? rota.slug, href: base });
  if (rota.secao) m.push({ label: SECOES_TORNEIO[rota.secao] ?? rota.secao });
  if (rota.categoriaId) {
    const cat = contexto?.categorias.find((c) => c.id === rota.categoriaId);
    m.push({ label: cat?.nome ?? "Categoria", href: `${base}/categorias/${rota.categoriaId}/jogos` });
    if (rota.abaCategoria) m.push({ label: ABAS_CATEGORIA[rota.abaCategoria] ?? rota.abaCategoria });
  }
  return m;
}

export function AdminShell({ usuario, isAdmin, children }: { usuario: Usuario; isAdmin: boolean; children: ReactNode }) {
  const pathname = usePathname() || "/admin";
  const rota = interpretarRota(pathname);
  const contexto = useTorneioContexto(rota.slug);
  const [menuAberto, setMenuAberto] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  if (rota.telaCheia) {
    return <div className="admin-theme min-h-screen">{children}</div>;
  }

  const migalhas = montarMigalhas(pathname, contexto);
  const iniciais = (usuario.nome || "Admin")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const sidebar = (onNavigate?: () => void) => (
    <SidebarConteudo pathname={pathname} rota={rota} contexto={contexto} isAdmin={isAdmin} onNavigate={onNavigate} />
  );

  return (
    <div className="admin-theme flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-y-auto bg-rail px-3.5 py-5 [scrollbar-width:thin] lg:flex">
        {sidebar()}
      </aside>

      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-[rgba(22,24,29,0.55)]" onClick={() => setMenuAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-rail px-3.5 py-5">
            <button
              type="button"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-[#c3c6cd] hover:bg-rail-2 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar(() => setMenuAberto(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-paper/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-line bg-white text-ink lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <nav aria-label="Caminho" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted">
            {migalhas.map((m, idx) => {
              const ultima = idx === migalhas.length - 1;
              return (
                <Fragment key={`${m.label}-${idx}`}>
                  {idx > 0 && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 sm:block" />}
                  {ultima || !m.href ? (
                    <span className={ultima ? "truncate font-bold text-ink" : "hidden truncate sm:inline"}>{m.label}</span>
                  ) : (
                    <Link href={m.href} className="hidden truncate hover:text-ink sm:inline">
                      {m.label}
                    </Link>
                  )}
                </Fragment>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setBuscaAberta(true)}
            className="flex h-10 items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 text-sm text-muted hover:border-[#d3cfc7] md:w-[320px]"
          >
            <Search className="h-[18px] w-[18px] shrink-0" />
            <span className="hidden flex-1 text-left md:inline">Buscar torneio, categoria…</span>
            <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] font-bold md:inline">Ctrl K</kbd>
          </button>

          <Menu
            items={[
              { label: "Ver site público", href: "/", icon: <ExternalLink /> },
              "separator",
              {
                label: "Sair",
                icon: <LogOut />,
                danger: true,
                onSelect: () => {
                  const form = document.createElement("form");
                  form.method = "post";
                  form.action = "/api/v1/auth/logout";
                  document.body.appendChild(form);
                  form.submit();
                },
              },
            ]}
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label="Conta"
                title={usuario.nome ?? undefined}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-white"
              >
                {iniciais || "AD"}
              </button>
            )}
          />
        </header>

        <main className="w-full max-w-[1480px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>

      <CommandPalette open={buscaAberta} onOpenChange={setBuscaAberta} slug={rota.slug} contexto={contexto} />
    </div>
  );
}
