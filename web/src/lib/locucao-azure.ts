/**
 * Locucao das chamadas com o Azure Speech (TTS), mesmo provedor do projeto meuquerido.
 * Variaveis: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (ex.: brazilsouth) e, opcional, AZURE_SPEECH_VOICE.
 * Sem chave configurada, o telao cai na voz do proprio navegador.
 */
const VOZ_PADRAO = "pt-BR-ThalitaMultilingualNeural";

export function locucaoConfigurada() {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

function escaparXml(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function sintetizarLocucao(texto: string): Promise<Buffer> {
  const chave = process.env.AZURE_SPEECH_KEY;
  const regiao = process.env.AZURE_SPEECH_REGION;
  if (!chave || !regiao) throw new Error("Locução por voz não configurada");
  const voz = process.env.AZURE_SPEECH_VOICE || VOZ_PADRAO;
  const ssml = `<speak version="1.0" xml:lang="pt-BR"><voice name="${voz}">${escaparXml(texto)}</voice></speak>`;
  const res = await fetch(`https://${regiao}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": chave,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "campeonatobt",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Falha na síntese de voz (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
