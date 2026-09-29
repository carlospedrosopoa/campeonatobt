import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[14px] border border-line bg-white", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-extrabold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "signal";
  className?: string;
}) {
  return (
    <Card className={cn("px-4 py-4 sm:px-5", tone === "signal" && "border-[#f4c9ae]", className)}>
      <div className={cn("text-[11px] font-extrabold uppercase tracking-[0.08em]", tone === "signal" ? "text-[#9a3412]" : "text-muted")}>
        {label}
      </div>
      <div className={cn("mt-1.5 font-display text-4xl font-bold leading-none tabular-nums", tone === "signal" ? "text-signal-strong" : "text-ink")}>
        {value}
      </div>
      {hint && <div className="mt-2 text-xs font-semibold text-ink-2">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-sand-2 text-muted [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <div className="text-sm font-bold text-ink">{title}</div>
      {description && <div className="max-w-sm text-[13px] text-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "danger", children, className }: { tone?: "danger" | "warning" | "info" | "success"; children: ReactNode; className?: string }) {
  const tones = {
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;
  return <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", tones[tone], className)}>{children}</div>;
}
