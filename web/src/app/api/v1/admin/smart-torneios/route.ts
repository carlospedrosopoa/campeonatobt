import { NextRequest, NextResponse } from "next/server";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";
import { listarSmartAdmin, type StatusSmart } from "@/services/smart-torneio.service";

/** Pedidos de Smart Torneio para o gestor do Play na Quadra. ?status= filtra */
export async function GET(request: NextRequest) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  const status = (request.nextUrl.searchParams.get("status") || null) as StatusSmart | null;
  return NextResponse.json({ smartTorneios: await listarSmartAdmin(status) }, { headers: { "Cache-Control": "no-store" } });
}
