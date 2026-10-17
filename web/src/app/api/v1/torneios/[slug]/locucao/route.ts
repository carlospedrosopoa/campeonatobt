import { NextRequest, NextResponse } from "next/server";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { locucaoConfigurada, sintetizarLocucao } from "@/lib/locucao-azure";

/** Gera o audio (mp3) da chamada. Body: { texto }. 501 quando o Azure nao esta configurado (o telao usa a voz do navegador). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acesso = await requireTournamentAdminBySlug(slug);
  if ("response" in acesso) return acesso.response;
  if (!locucaoConfigurada()) return NextResponse.json({ error: "Locução por voz não configurada" }, { status: 501 });

  const body = await request.json().catch(() => null);
  const texto = String(body?.texto || "").trim().slice(0, 600);
  if (!texto) return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 });
  try {
    const audio = await sintetizarLocucao(texto);
    return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Falha na locução" }, { status: 502 });
  }
}
