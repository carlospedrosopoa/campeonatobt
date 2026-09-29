import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, TorneioStatusBadge } from "@/components/admin/ui";
import { formatarDataOnly } from "@/lib/utils";

export type TorneioResumo = {
  id: string;
  nome: string;
  slug: string;
  dataInicio: string | Date | null;
  dataFim: string | Date | null;
  local: string | null;
  status: string;
  bannerUrl?: string | null;
  logoUrl?: string | null;
  esporteNome?: string | null;
};

export function periodoTorneio(t: Pick<TorneioResumo, "dataInicio" | "dataFim">) {
  const ini = t.dataInicio ? formatarDataOnly(String(t.dataInicio)) : null;
  const fim = t.dataFim ? formatarDataOnly(String(t.dataFim)) : null;
  if (ini && fim && ini !== fim) return `${ini} a ${fim}`;
  return ini ?? "Data a definir";
}

/** Miniatura com banner do torneio; sem banner, desenha uma quadra estilizada. */
export function TorneioMiniatura({ torneio, className = "h-28 w-32" }: { torneio: TorneioResumo; className?: string }) {
  const img = torneio.bannerUrl || torneio.logoUrl;
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-[10px] bg-ocean ${className}`}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-3 border-2 border-white/55" />
          <div className="absolute bottom-3 left-1/2 top-3 w-0.5 -translate-x-1/2 bg-white/55" />
        </>
      )}
    </div>
  );
}

/** Cartao grande para torneios em andamento (destaque no topo das listas). */
export function TorneioDestaque({ torneio }: { torneio: TorneioResumo }) {
  const aoVivo = torneio.status === "EM_ANDAMENTO";
  return (
    <Link
      href={`/admin/torneios/${torneio.slug}`}
      className="group flex gap-4 rounded-[14px] border border-line bg-white p-4 transition-shadow hover:shadow-[0_6px_20px_rgba(23,24,28,0.08)]"
    >
      <TorneioMiniatura torneio={torneio} className="h-24 w-24 sm:h-28 sm:w-32" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {aoVivo ? (
            <Badge tone="live" dot>
              Ao vivo
            </Badge>
          ) : (
            <TorneioStatusBadge status={torneio.status} />
          )}
          <span className="text-xs text-muted">{periodoTorneio(torneio)}</span>
        </div>
        <div className="font-display text-2xl font-bold leading-[1.05] text-ink">{torneio.nome}</div>
        <div className="mt-auto flex items-center justify-between gap-2 text-[13px] text-ink-2">
          <span className="truncate">
            {[torneio.local, torneio.esporteNome].filter(Boolean).join(" · ") || "Local a definir"}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-bold text-signal-strong">
            Abrir <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
