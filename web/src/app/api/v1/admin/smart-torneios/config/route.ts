import { NextRequest, NextResponse } from "next/server";
import { requireGlobalAdmin } from "@/lib/torneio-admin-auth";
import { obterConfigSmart, salvarConfigSmart } from "@/services/smart-torneio.service";

/** Preco e Pix do Play na Quadra para o Smart Torneio. */
export async function GET() {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  return NextResponse.json(await obterConfigSmart());
}

export async function PUT(request: NextRequest) {
  const acesso = await requireGlobalAdmin();
  if ("response" in acesso) return acesso.response;
  const b = (await request.json().catch(() => null)) ?? {};
  return NextResponse.json(
    await salvarConfigSmart({
      valorPorAtleta: b.valorPorAtleta == null ? undefined : Number(b.valorPorAtleta),
      valorMinimo: b.valorMinimo == null ? undefined : Number(b.valorMinimo),
      pixChave: b.pixChave === undefined ? undefined : String(b.pixChave ?? ""),
      pixNome: b.pixNome === undefined ? undefined : String(b.pixNome ?? ""),
      pixCidade: b.pixCidade === undefined ? undefined : String(b.pixCidade ?? ""),
    })
  );
}
