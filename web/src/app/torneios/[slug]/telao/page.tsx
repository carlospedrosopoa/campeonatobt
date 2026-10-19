"use client";

import { useParams, useSearchParams } from "next/navigation";
import { TelaoView } from "@/components/admin/operacao/telao-view";

/** Telao sem login, aberto pelo link com codigo (Smart Torneio): fica no aparelho ligado a caixa de som. */
export default function TelaoPublicoPage() {
  const { slug } = useParams<{ slug: string }>();
  const busca = useSearchParams();
  return <TelaoView slug={slug} categoriaId={busca.get("categoria")} codigo={busca.get("c")} />;
}
