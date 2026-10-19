"use client";

import { useParams, useSearchParams } from "next/navigation";
import { TelaoView } from "@/components/admin/operacao/telao-view";

/** Telao da operacao (admin logado). */
export default function TelaoOperacaoPage() {
  const { slug } = useParams<{ slug: string }>();
  const categoriaId = useSearchParams().get("categoria");
  return <TelaoView slug={slug} categoriaId={categoriaId} />;
}
