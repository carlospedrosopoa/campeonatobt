import { gzappyConfigService } from "@/services/gzappy-config.service";

export type EnviarMensagemGzappyParams = {
  destinatario: string;
  mensagem: string;
};

export function formatarNumeroGzappy(telefone: string) {
  const apenasNumeros = (telefone || "").replace(/\D/g, "");
  if (!apenasNumeros) return "";
  if (apenasNumeros.startsWith("0")) return apenasNumeros.substring(1);
  if (apenasNumeros.startsWith("55")) {
    const resto = apenasNumeros.substring(2);
    if (resto.length >= 10 && resto.length <= 11) return apenasNumeros;
    if (resto.length < 10 || resto.length > 11) return `55${resto}`;
  }
  if (apenasNumeros.length >= 12) return apenasNumeros;
  return `55${apenasNumeros}`;
}

export function numeroGzappyValidoParaEnvio(telefoneFormatado: string) {
  const n = (telefoneFormatado || "").replace(/\D/g, "");
  if (!n) return false;
  if (n.startsWith("55")) {
    const resto = n.substring(2);
    return resto.length >= 10 && resto.length <= 11;
  }
  return false;
}

export async function enviarMensagemGzappy(params: EnviarMensagemGzappyParams) {
  const config = await gzappyConfigService.obter();
  const apiKey = (config.apiKey || process.env.GZAPPY_API_KEY || "").trim();
  if (!config.ativo || !apiKey) return { ok: false, skipped: true as const };

  const destinatario = formatarNumeroGzappy(params.destinatario);
  if (!destinatario) return { ok: false, skipped: true as const };
  if (!numeroGzappyValidoParaEnvio(destinatario)) {
    console.log("[gzappy:enviar] skip numero_invalido_ou_nao_brasileiro", {
      destinatarioEntrada: params.destinatario,
      destinatarioFormatado: destinatario,
    });
    return { ok: false, skipped: true as const, motivo: "numero_invalido_ou_nao_brasileiro", destinatario };
  }

  const payload = { phone: destinatario, message: params.mensagem };
  console.log("[gzappy:enviar] payload", {
    phone: destinatario,
    preview: payload.message ? payload.message.slice(0, 120) : null,
    tamanho: payload.message ? payload.message.length : 0,
  });
  const res = await fetch("https://v2-api.gzappy.com/message/send-text", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data: any = null;
  try {
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
  } catch {
    data = null;
  }
  if (!res.ok) {
    let erroPreview: any = data;
    try {
      if (data && Array.isArray(data?.message)) {
        erroPreview = data.message.map((m: any) => {
          if (typeof m === "string") return m;
          try {
            return JSON.stringify(m);
          } catch {
            return String(m);
          }
        });
      } else if (data?.message && typeof data.message === "string") {
        erroPreview = data.message;
      }
    } catch {}
    console.log("[gzappy:enviar] falha", {
      status: res.status,
      erroPreview,
      dataBruta: data ? JSON.stringify(data).slice(0, 1000) : null,
    });
    return { ok: false, skipped: false as const, status: res.status, data, erroPreview };
  }
  console.log("[gzappy:enviar] sucesso", { data: data ? JSON.stringify(data).slice(0, 500) : null });
  return { ok: true, skipped: false as const, data };
}

