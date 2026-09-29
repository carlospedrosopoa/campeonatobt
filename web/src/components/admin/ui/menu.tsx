"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MenuItem =
  | {
      label: ReactNode;
      icon?: ReactNode;
      onSelect?: () => void;
      href?: string;
      external?: boolean;
      disabled?: boolean;
      danger?: boolean;
      hint?: ReactNode;
    }
  | "separator";

/** Menu suspenso simples (acoes secundarias: Exportar, Mais acoes…). */
export function Menu({
  trigger,
  items,
  align = "end",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-[calc(100%+6px)] z-40 min-w-[220px] overflow-hidden rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_rgba(23,24,28,0.14)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, idx) => {
            if (item === "separator") return <div key={`sep-${idx}`} className="my-1 h-px bg-line" />;
            const cls = cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-sand [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-muted",
              item.danger && "text-red-700 [&_svg]:text-red-600 hover:bg-red-50",
              item.disabled && "pointer-events-none opacity-50",
            );
            const content = (
              <>
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-xs font-medium text-muted">{item.hint}</span>}
              </>
            );
            if (item.href) {
              return (
                <Link
                  key={idx}
                  role="menuitem"
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  className={cls}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={idx}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                className={cls}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
