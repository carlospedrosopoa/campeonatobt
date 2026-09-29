"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CornerDownLeft, Search, Trophy } from "lucide-react";
import { SECOES_TORNEIO } from "./rotas";
import type { TorneioContexto } from "./use-torneio-contexto";

type TorneioBusca = { id: string; nome: string; slug: string; local?: string; status?: string };

let torneiosCache: TorneioBusca[] | null = null;

const itemCls =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink data-[selected=true]:bg-sand-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted";
const grupoCls =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted";

/** Busca global (Ctrl/Cmd + K): torneios, categorias e secoes do torneio atual. */
export function CommandPalette({
  open,
  onOpenChange,
  slug,
  contexto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string | null;
  contexto: TorneioContexto | null;
}) {
  const router = useRouter();
  const [torneios, setTorneios] = useState<TorneioBusca[]>(torneiosCache ?? []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || torneiosCache) return;
    (async () => {
      try {
        const res = await fetch("/api/v1/torneios?limit=200", { cache: "no-store" });
        if (!res.ok) return;
        const dados = (await res.json()) as TorneioBusca[];
        torneiosCache = dados;
        setTorneios(dados);
      } catch {
        // sem lista de torneios, a busca mostra apenas os atalhos
      }
    })();
  }, [open]);

  if (!open) return null;

  function ir(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const base = slug ? `/admin/torneios/${slug}` : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(22,24,29,0.5)] px-4 pt-[12vh]" onMouseDown={() => onOpenChange(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_64px_rgba(0,0,0,0.25)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command label="Busca global" loop>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="h-[18px] w-[18px] text-muted" />
            <Command.Input
              autoFocus
              placeholder="Buscar torneio, categoria ou tela…"
              className="h-14 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-muted"
              onKeyDown={(e) => {
                if (e.key === "Escape") onOpenChange(false);
              }}
            />
            <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-bold text-muted">Esc</kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted">Nada encontrado.</Command.Empty>

            {base && contexto?.torneio && (
              <Command.Group heading={contexto.torneio.nome} className={grupoCls}>
                <Command.Item className={itemCls} value={`visao geral ${contexto.torneio.nome}`} onSelect={() => ir(base)}>
                  Visão geral
                </Command.Item>
                {Object.entries(SECOES_TORNEIO).map(([secao, label]) => (
                  <Command.Item key={secao} className={itemCls} value={`${label} ${contexto.torneio?.nome}`} onSelect={() => ir(`${base}/${secao}`)}>
                    {label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {base && (contexto?.categorias.length ?? 0) > 0 && (
              <Command.Group heading="Categorias" className={grupoCls}>
                {contexto!.categorias.map((c) => (
                  <Command.Item key={c.id} className={itemCls} value={`categoria ${c.nome} ${c.id}`} onSelect={() => ir(`${base}/categorias/${c.id}/jogos`)}>
                    <Trophy />
                    <span className="flex-1">{c.nome}</span>
                    <span className="text-xs font-medium text-muted">Jogos</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Torneios" className={grupoCls}>
              {torneios.map((t) => (
                <Command.Item key={t.id} className={itemCls} value={`torneio ${t.nome} ${t.slug} ${t.local ?? ""}`} onSelect={() => ir(`/admin/torneios/${t.slug}`)}>
                  <Trophy />
                  <span className="flex-1 truncate">{t.nome}</span>
                  {t.local && <span className="truncate text-xs font-medium text-muted">{t.local}</span>}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Atalhos" className={grupoCls}>
              <Command.Item className={itemCls} value="painel inicio" onSelect={() => ir("/admin")}>
                Painel
              </Command.Item>
              <Command.Item className={itemCls} value="lista de torneios" onSelect={() => ir("/admin/torneios")}>
                Lista de torneios
              </Command.Item>
              <Command.Item className={itemCls} value="novo torneio criar" onSelect={() => ir("/admin/torneios/novo")}>
                Criar torneio
              </Command.Item>
            </Command.Group>
          </Command.List>
          <div className="flex items-center gap-2 border-t border-line bg-paper px-4 py-2 text-xs text-muted">
            <CornerDownLeft className="h-3.5 w-3.5" /> abrir
            <span className="mx-1">·</span>↑↓ navegar
          </div>
        </Command>
      </div>
    </div>
  );
}
