import Link from "next/link";
import type { ReactNode } from "react";
import { Banknote, Crown, Gamepad2, Network, Settings, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { GENERO_LABEL } from "@/components/admin/ui";

export type AbaCategoria = "inscricoes" | "configuracao" | "jogos" | "chave" | "sorteio" | "arbitro";

type CategoriaResumo = {
  nome: string;
  genero?: string | null;
  valorInscricao?: string | number | null;
  vagasMaximas?: number | null;
} | null;

const ABAS: Array<{ id: AbaCategoria; label: string; path: string; icon: ReactNode }> = [
  { id: "inscricoes", label: "Inscrições", path: "inscricoes", icon: <Banknote /> },
  { id: "configuracao", label: "Configuração", path: "configuracao", icon: <Settings /> },
  { id: "jogos", label: "Jogos", path: "jogos", icon: <Gamepad2 /> },
  { id: "chave", label: "Chave", path: "chave", icon: <Network /> },
  { id: "sorteio", label: "Sorteio ao vivo", path: "sorteio", icon: <Crown /> },
  { id: "arbitro", label: "Modo árbitro", path: "jogos/arbitro", icon: <Smartphone /> },
];

function moeda(v: string | number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Cabecalho comum das telas de uma categoria: titulo, resumo, acoes e abas. */
export function CategoriaHeader({
  slug,
  categoriaId,
  categoria,
  ativa,
  titulo,
  resumo,
  acoes,
  porInscricao = false,
}: {
  slug: string;
  categoriaId: string;
  categoria: CategoriaResumo;
  ativa: AbaCategoria;
  /** substitui o nome da categoria no titulo */
  titulo?: ReactNode;
  /** substitui a linha de resumo padrao (genero, taxa, vagas) */
  resumo?: ReactNode;
  acoes?: ReactNode;
  /** categorias simples cobram por inscricao, nao por atleta */
  porInscricao?: boolean;
}) {
  const base = `/admin/torneios/${slug}/categorias/${categoriaId}`;

  const resumoPadrao = categoria ? (
    <>
      {GENERO_LABEL[categoria.genero ?? ""] ?? categoria.genero}
      {" · "}
      {categoria.valorInscricao ? (
        <>
          {moeda(categoria.valorInscricao)} {porInscricao ? "por inscrição" : "por atleta"}
          {!porInscricao && <span className="text-muted"> (dupla {moeda(Number(categoria.valorInscricao) * 2)})</span>}
        </>
      ) : (
        "sem taxa"
      )}
      {" · "}
      {categoria.vagasMaximas ? `${categoria.vagasMaximas} vagas` : "sem limite de vagas"}
    </>
  ) : null;

  return (
    <div className="-mx-4 -mt-5 border-b border-line bg-paper px-4 pt-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mt-7 lg:px-8 lg:pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] font-bold leading-none text-ink sm:text-[40px]">
            {titulo ?? categoria?.nome ?? "Categoria"}
          </h1>
          <div className="mt-2 text-sm text-ink-2">{resumo ?? resumoPadrao}</div>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>

      <nav aria-label="Seções da categoria" className="-mb-px mt-4 flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {ABAS.map((aba) => {
          const on = aba.id === ativa;
          return (
            <Link
              key={aba.id}
              href={`${base}/${aba.path}`}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm transition-colors [&_svg]:h-4 [&_svg]:w-4",
                on
                  ? "border-signal font-extrabold text-ink [&_svg]:text-signal"
                  : "border-transparent font-semibold text-ink-2 hover:text-ink [&_svg]:text-muted",
              )}
            >
              {aba.icon}
              {aba.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
