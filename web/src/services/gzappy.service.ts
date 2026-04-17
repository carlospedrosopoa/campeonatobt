import { gzappyConfigService } from "@/services/gzappy-config.service";

export type EnviarMensagemGzappyParams = {
  destinatario: string;
  mensagem: string;
};

export function formatarNumeroGzappy(telefone: string) {
  const apenasNumeros = (telefone || "").replace(/\D/g, "");
  if (!apenasNumeros) return "";
  if (apenasNumeros.startsWith("0")) return apenasNumeros.substring(1);
  if (apenasNumeros.length >= 12) return apenasNumeros;
  return `55${apenasNumeros}`;
}

export async function enviarMensagemGzappy(params: EnviarMensagemGzappyParams) {
  const config = await gzappyConfigService.obter();
  const apiKey = (config.apiKey || process.env.GZAPPY_API_KEY || "").trim();
  if (!config.ativo || !apiKey) return { ok: false, skipped: true as const };

  const destinatario = formatarNumeroGzappy(params.destinatario);
  if (!destinatario) return { ok: false, skipped: true as const };

  const payload = { phone: destinatario, message: params.mensagem };
  const res = await fetch("https://v2-api.gzappy.com/message/send-text", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, skipped: false as const, status: res.status, data };
  }
  return { ok: true, skipped: false as const, data };
}

