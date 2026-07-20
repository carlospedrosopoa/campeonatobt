import { deleteImage } from "@/lib/googleCloudStorage";

type ValorComparavel = Date | string | null | undefined;

export type PartidaCardStructuralState = {
  fotoUrl?: string | null;
  dataHorario?: ValorComparavel;
  arenaId?: string | null;
  quadra?: string | null;
  equipeAId?: string | null;
  equipeBId?: string | null;
};

function normalizarTexto(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizarData(value?: ValorComparavel) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function deveInvalidarCardPartida(
  atual: PartidaCardStructuralState,
  proximo: Omit<PartidaCardStructuralState, "fotoUrl">
) {
  const fotoUrl = normalizarTexto(atual.fotoUrl);
  if (!fotoUrl) return false;

  return (
    normalizarData(atual.dataHorario) !== normalizarData(proximo.dataHorario) ||
    normalizarTexto(atual.arenaId) !== normalizarTexto(proximo.arenaId) ||
    normalizarTexto(atual.quadra) !== normalizarTexto(proximo.quadra) ||
    normalizarTexto(atual.equipeAId) !== normalizarTexto(proximo.equipeAId) ||
    normalizarTexto(atual.equipeBId) !== normalizarTexto(proximo.equipeBId)
  );
}

export async function excluirCardPartidaDoGcs(fotoUrl?: string | null) {
  const url = normalizarTexto(fotoUrl);
  if (!url) return;
  await deleteImage(url);
}
