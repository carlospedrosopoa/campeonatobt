"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** O admin tem a propria barra superior; a navbar publica fica oculta nele. */
export function NavbarGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  // telao sem login (TV da caixa de som): tela cheia, sem o cabecalho do site
  if (/^\/torneios\/[^/]+\/telao/.test(pathname ?? "")) return null;
  return <>{children}</>;
}
