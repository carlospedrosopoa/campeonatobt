"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  DollarSign,
  ExternalLink,
  FileUp,
  Gamepad2,
  Handshake,
  LayoutGrid,
  MapPin,
  MessageSquare,
  SlidersHorizontal,
  Trophy,
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, TORNEIO_STATUS, type TorneioStatus } from "@/components/admin/ui";
import type { RotaAdmin } from "./rotas";
import type { TorneioContexto } from "./use-torneio-contexto";

function NavItem({
  href,
  icon,
  active,
  children,
  count,
  countTone = "muted",
  onNavigate,
}: {
  href: string;
  icon: ReactNode;
  active?: boolean;
  children: ReactNode;
  count?: number | null;
  countTone?: "muted" | "signal" | "live";
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-semibold transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0",
        active ? "bg-[#262a32] text-white" : "text-[#c3c6cd] hover:bg-[#1f2228] hover:text-white",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "rounded-full px-2 py-px text-xs font-bold",
            countTone === "signal" && "bg-signal text-white",
            countTone === "live" && "bg-ocean text-white",
            countTone === "muted" && "text-[#8e929b]",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="mb-1 px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#7c808a]">{titulo}</div>
      {children}
    </div>
  );
}

export function Marca() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-2">
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-signal text-white">
        <Trophy className="h-[18px] w-[18px]" />
      </span>
      <span>
        <span className="block font-display text-[19px] font-bold leading-none text-white">Play na Quadra</span>
        <span className="mt-1 block text-xs text-[#8e929b]">Admin de competições</span>
      </span>
    </Link>
  );
}

export function SidebarConteudo({
  pathname,
  rota,
  contexto,
  isAdmin,
  onNavigate,
}: {
  pathname: string;
  rota: RotaAdmin;
  contexto: TorneioContexto | null;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  if (!rota.slug) {
    return (
      <div className="flex flex-1 flex-col gap-7">
        <Marca />
        <nav className="flex flex-col gap-0.5">
          <NavItem href="/admin" icon={<LayoutGrid />} active={pathname === "/admin"} onNavigate={onNavigate}>
            Painel
          </NavItem>
          <NavItem href="/admin/torneios" icon={<Trophy />} active={pathname.startsWith("/admin/torneios")} onNavigate={onNavigate}>
            Torneios
          </NavItem>
          {isAdmin && (
            <>
              <NavItem
                href="/admin/configuracoes/organizadores"
                icon={<UserCog />}
                active={pathname.startsWith("/admin/configuracoes/organizadores")}
                onNavigate={onNavigate}
              >
                Organizadores
              </NavItem>
              <NavItem
                href="/admin/configuracoes"
                icon={<SlidersHorizontal />}
                active={pathname === "/admin/configuracoes"}
                onNavigate={onNavigate}
              >
                Configurações
              </NavItem>
            </>
          )}
        </nav>
      </div>
    );
  }

  const base = `/admin/torneios/${rota.slug}`;
  const torneio = contexto?.torneio;
  const statusMeta = torneio ? TORNEIO_STATUS[torneio.status as TorneioStatus] : null;
  const pendentes = contexto?.stats?.inscricoesPendentes ?? null;
  const categorias = contexto?.categorias ?? [];

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href="/admin/torneios" onClick={onNavigate} className="flex items-center gap-2 px-2 text-[13px] font-semibold text-[#8e929b] hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Todos os torneios
      </Link>

      <div className="flex flex-col gap-2 rounded-xl border border-rail-3 bg-rail-2 p-3">
        <div className="font-display text-[19px] font-bold leading-[1.1] text-white">{torneio?.nome ?? "Carregando…"}</div>
        {statusMeta && (
          <Badge tone={torneio?.status === "EM_ANDAMENTO" ? "live" : statusMeta.tone} dot={statusMeta.dot} className="self-start">
            {statusMeta.label}
          </Badge>
        )}
      </div>

      <nav className="flex flex-col gap-4">
        <Secao titulo="Operação">
          <NavItem href={base} icon={<LayoutGrid />} active={!rota.secao && !rota.categoriaId} onNavigate={onNavigate}>
            Visão geral
          </NavItem>
          <NavItem href={`${base}/jogos-do-dia`} icon={<CalendarDays />} active={rota.secao === "jogos-do-dia"} onNavigate={onNavigate}>
            Jogos do dia
          </NavItem>
          <NavItem href={`${base}/painel-quadras`} icon={<Gamepad2 />} active={rota.secao === "painel-quadras"} onNavigate={onNavigate}>
            Painel de quadras
          </NavItem>
          <NavItem href={`${base}/lista-chamada`} icon={<ClipboardCheck />} active={rota.secao === "lista-chamada"} onNavigate={onNavigate}>
            Lista de chamada
          </NavItem>
        </Secao>

        <Secao titulo="Competição">
          <NavItem href={`${base}#categorias`} icon={<Trophy />} active={Boolean(rota.categoriaId)} count={categorias.length} onNavigate={onNavigate}>
            Categorias
          </NavItem>
          {categorias.length > 0 && (
            <div className="mb-1 ml-[30px] flex max-h-56 flex-col gap-px overflow-y-auto border-l border-rail-3 pl-2.5 [scrollbar-width:thin]">
              {categorias.map((c) => {
                const ativa = rota.categoriaId === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`${base}/categorias/${c.id}/jogos`}
                    onClick={onNavigate}
                    aria-current={ativa ? "page" : undefined}
                    className={cn(
                      "truncate rounded-md px-2 py-1.5 text-[13px] font-semibold",
                      ativa ? "bg-rail-2 text-white" : "text-[#a3a7af] hover:text-white",
                    )}
                  >
                    {c.nome}
                  </Link>
                );
              })}
            </div>
          )}
          <NavItem
            href={`${base}/atletas-inscritos`}
            icon={<Users />}
            active={rota.secao === "atletas-inscritos"}
            count={pendentes}
            countTone="signal"
            onNavigate={onNavigate}
          >
            Atletas e inscrições
          </NavItem>
        </Secao>

        <Secao titulo="Gestão">
          <NavItem href={`${base}/cobranca`} icon={<DollarSign />} active={rota.secao === "cobranca"} onNavigate={onNavigate}>
            Cobrança
          </NavItem>
          <NavItem href={`${base}/comunicacoes`} icon={<MessageSquare />} active={rota.secao === "comunicacoes"} onNavigate={onNavigate}>
            Comunicações
          </NavItem>
          <NavItem href={`${base}/arenas`} icon={<MapPin />} active={rota.secao === "arenas"} onNavigate={onNavigate}>
            Arenas e quadras
          </NavItem>
          <NavItem href={`${base}/apoiadores`} icon={<Handshake />} active={rota.secao === "apoiadores"} onNavigate={onNavigate}>
            Apoiadores
          </NavItem>
          <NavItem
            href={`${base}/importar-supercampeonato`}
            icon={<FileUp />}
            active={rota.secao === "importar-supercampeonato"}
            onNavigate={onNavigate}
          >
            Importar Excel
          </NavItem>
          <NavItem href={`${base}/editar`} icon={<SlidersHorizontal />} active={rota.secao === "editar"} onNavigate={onNavigate}>
            Dados do torneio
          </NavItem>
        </Secao>
      </nav>

      <a
        href={`/torneios/${rota.slug}`}
        target="_blank"
        rel="noreferrer"
        className="mt-auto flex items-center gap-3 border-t border-[#2a2d34] px-3 pt-4 text-sm font-semibold text-[#c3c6cd] hover:text-white"
      >
        <ExternalLink className="h-[18px] w-[18px]" />
        Ver página pública
      </a>
    </div>
  );
}
