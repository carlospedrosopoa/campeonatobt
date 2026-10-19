import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { locucaoConfigurada, sintetizarLocucao } from "@/lib/locucao-azure";
import { validarCodigoTelao } from "@/lib/telao-codigo";

/** Voz da chamada (mp3) para o telao aberto por link com codigo. Query: ?c=CODIGO; Body: { texto } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);
  if (!torneio || !torneio.operacaoAoVivo || !validarCodigoTelao(torneio.id, request.nextUrl.searchParams.get("c"))) {
    return NextResponse.json({ error: "Link do telão inválido" }, { status: 404 });
  }
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
