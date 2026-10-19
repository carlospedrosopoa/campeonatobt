import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUser } from "@/lib/auth-request";
import { ErroSmart } from "@/services/smart-torneio.service";
import { conversarAssistenteSmart, transcreverFala, type MensagemAssistente, type RascunhoSmart } from "@/services/smart-assistente.service";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * Um turno da conversa por voz com a Thalita para criar o Smart Torneio.
 * Body: { audioBase64?, audioMime?, texto?, historico?, rascunho?, voz? (padrao true) }
 * Sem texto/audio e com historico vazio, a Thalita abre a conversa.
 * Resposta: { transcricao, resposta, audioBase64, audioMime, historico, rascunho, avaliacao, pedido }
 * O app guarda historico e rascunho e manda de volta no proximo turno.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await request.json().catch(() => null)) ?? {};
    let transcricao: string | null = null;
    if (typeof b.audioBase64 === "string" && b.audioBase64) {
      const audio = Buffer.from(b.audioBase64, "base64");
      if (audio.length > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Áudio muito longo" }, { status: 413 });
      transcricao = await transcreverFala(audio, String(b.audioMime || "audio/webm"));
      if (!transcricao) return NextResponse.json({ error: "Não consegui ouvir. Pode falar de novo?" }, { status: 422 });
    }
    const texto = transcricao ?? (typeof b.texto === "string" ? b.texto : null);
    const r = await conversarAssistenteSmart({
      usuarioId: auth.user.id,
      nomeAtleta: auth.user.nome || "",
      texto,
      historico: Array.isArray(b.historico) ? (b.historico as MensagemAssistente[]) : [],
      rascunho: b.rascunho && typeof b.rascunho === "object" ? (b.rascunho as RascunhoSmart) : {},
      comVoz: b.voz !== false,
    });
    return NextResponse.json({ transcricao, ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErroSmart) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Erro no assistente do Smart Torneio:", e);
    // erro da OpenAI (chave, credito, modelo): mostra o motivo para dar para corrigir
    if (e instanceof OpenAI.APIError) {
      return NextResponse.json({ error: `IA indisponível (${e.status ?? "?"}): ${e.message}` }, { status: 502 });
    }
    if (e instanceof Error) return NextResponse.json({ error: `Erro no assistente: ${e.message}` }, { status: 500 });
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
