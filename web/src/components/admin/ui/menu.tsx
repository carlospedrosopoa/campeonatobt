"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  const [posicao, setPosicao] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);

  // Posicao fixa calculada a partir do botao: o menu nao e cortado por cartoes com overflow
  // e abre para cima quando nao ha espaco embaixo (ex.: ultima linha de uma lista).
  function calcularPosicao() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const alturaEstimada = items.length * 40 + 16;
    const espacoAbaixo = window.innerHeight - r.bottom;
    const paraCima = espacoAbaixo < alturaEstimada + 12 && r.top > espacoAbaixo;
    setPosicao({
      position: "fixed",
      top: paraCima ? undefined : r.bottom + 6,
      bottom: paraCima ? window.innerHeight - r.top + 6 : undefined,
      left: align === "start" ? Math.max(8, r.left) : undefined,
      right: align === "end" ? Math.max(8, window.innerWidth - r.right) : undefined,
      maxHeight: Math.max(160, (paraCima ? r.top : espacoAbaixo) - 16),
      overflowY: "auto",
    });
  }

  function alternar() {
    if (!open) calcularPosicao();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onMover(e: Event) {
      // rolar a propria lista do menu nao fecha
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMover);
    window.addEventListener("scroll", onMover, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMover);
      window.removeEventListener("scroll", onMover, true);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {trigger({ open, toggle: alternar })}
      {open && (
        <div
          role="menu"
          style={posicao}
          className={cn(
            "z-50 min-w-[220px] rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_rgba(23,24,28,0.14)]",
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
