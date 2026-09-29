import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "success" | "info" | "live" | "warning" | "danger" | "dark" | "signal";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-sand-2 text-ink-2",
  success: "bg-[#e3f3ea] text-[#17663f]",
  info: "bg-ocean-soft text-ocean-strong",
  live: "bg-ocean text-white",
  warning: "bg-[#fdf1dc] text-[#8a4e00]",
  danger: "bg-[#fde8e6] text-[#a11f14]",
  dark: "bg-ink text-white",
  signal: "bg-signal-soft text-[#9a3412]",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full bg-current", tone === "live" && "animate-pulse")} />}
      {children}
    </span>
  );
}

export type TorneioStatus = "RASCUNHO" | "ABERTO" | "EM_ANDAMENTO" | "FINALIZADO" | "CANCELADO";

export const TORNEIO_STATUS: Record<TorneioStatus, { label: string; tone: BadgeTone; dot: boolean }> = {
  RASCUNHO: { label: "Rascunho", tone: "neutral", dot: true },
  ABERTO: { label: "Inscrições abertas", tone: "success", dot: true },
  EM_ANDAMENTO: { label: "Em andamento", tone: "info", dot: true },
  FINALIZADO: { label: "Finalizado", tone: "dark", dot: false },
  CANCELADO: { label: "Cancelado", tone: "danger", dot: false },
};

export function TorneioStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = TORNEIO_STATUS[(status ?? "") as TorneioStatus] ?? { label: status || "—", tone: "neutral" as const, dot: false };
  return (
    <Badge tone={meta.tone} dot={meta.dot} className={className}>
      {meta.label}
    </Badge>
  );
}

export const GENERO_LABEL: Record<string, string> = {
  MASCULINO: "Masculino",
  FEMININO: "Feminino",
  MISTO: "Misto",
};
