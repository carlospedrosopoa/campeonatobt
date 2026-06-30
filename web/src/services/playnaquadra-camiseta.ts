import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playGetAtletaById } from "@/services/playnaquadra-client";

export function extractCamisetaFromPlay(payload: any) {
  const candidates = [
    payload,
    payload?.atleta,
    payload?.perfil,
    payload?.perfilAtleta,
    payload?.usuario,
    payload?.user,
    payload?.data,
  ];
  const keys = [
    "camiseta",
    "tamanhoCamiseta",
    "tamanho_camiseta",
    "camisetaTamanho",
    "camiseta_tamanho",
    "tamanhoCamisa",
    "tamanho_camisa",
    "shirtSize",
    "jerseySize",
  ];

  for (const obj of candidates) {
    if (!obj || typeof obj !== "object") continue;
    for (const k of keys) {
      const v = (obj as any)?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }

    const nested = (obj as any)?.camiseta || (obj as any)?.uniforme;
    if (nested && typeof nested === "object") {
      for (const k of keys) {
        const v = (nested as any)?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
  }

  return null;
}

export async function buscarCamisetaAtletaNoPlay(playnaquadraAtletaId: string) {
  const atletaId = String(playnaquadraAtletaId || "").trim();
  if (!atletaId) return null;

  try {
    const token = await getPlayAdminToken();
    const res = await playGetAtletaById({ token, atletaId });
    if (!res.res.ok) return null;
    return extractCamisetaFromPlay(res.data);
  } catch {
    return null;
  }
}
