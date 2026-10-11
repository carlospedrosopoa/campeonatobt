import { randomInt } from "crypto";

/** Regras puras do formato "Só mata-mata": chave sorteada direto das inscricoes, sem fase de grupos. */

export type FaseChaveDireta = "OITAVAS" | "QUARTAS" | "SEMI" | "FINAL";
export type Confronto = { a: string; b: string };

export const TAMANHO_MAXIMO_CHAVE_DIRETA = 16;

function proximaPotenciaDeDois(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function faseInicialDaChave(tamanhoChave: number): FaseChaveDireta {
  if (tamanhoChave <= 2) return "FINAL";
  if (tamanhoChave === 4) return "SEMI";
  if (tamanhoChave === 8) return "QUARTAS";
  return "OITAVAS";
}

function embaralhar<T>(itens: T[], aleatorio: (max: number) => number): T[] {
  const copia = itens.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Sorteia a chave: completa ate a proxima potencia de 2 com "byes" (equipes que passam direto
 * para a fase seguinte) e emparelha as demais na primeira fase.
 */
export function sortearChaveDireta(equipeIds: string[], aleatorio: (max: number) => number = randomInt) {
  const unicas = Array.from(new Set(equipeIds.filter(Boolean)));
  if (unicas.length < 2) throw new Error("Necessário pelo menos 2 equipes aprovadas para gerar o mata-mata");
  if (unicas.length > TAMANHO_MAXIMO_CHAVE_DIRETA) {
    throw new Error(`O mata-mata direto suporta até ${TAMANHO_MAXIMO_CHAVE_DIRETA} equipes`);
  }

  const tamanhoChave = proximaPotenciaDeDois(unicas.length);
  const sorteadas = embaralhar(unicas, aleatorio);
  const quantidadeByes = tamanhoChave - unicas.length;
  const byes = sorteadas.slice(0, quantidadeByes);
  const restantes = sorteadas.slice(quantidadeByes);

  const jogos: Confronto[] = [];
  for (let i = 0; i < restantes.length; i += 2) jogos.push({ a: restantes[i], b: restantes[i + 1] });

  return { fase: faseInicialDaChave(tamanhoChave), tamanhoChave, jogos, byes };
}

/**
 * Monta os confrontos da fase seguinte. Quem passou direto (bye) enfrenta primeiro os vencedores,
 * na ordem; o que sobrar se enfrenta entre si.
 */
export function montarConfrontosProximaFase(byes: string[], vencedores: string[]): Confronto[] {
  const total = byes.length + vencedores.length;
  if (total < 2 || (total & (total - 1)) !== 0) {
    throw new Error("Não foi possível montar a próxima fase do mata-mata: quantidade de equipes inválida.");
  }

  const confrontos: Confronto[] = [];
  const pares = Math.min(byes.length, vencedores.length);
  for (let i = 0; i < pares; i++) confrontos.push({ a: byes[i], b: vencedores[i] });

  const sobra = [...byes.slice(pares), ...vencedores.slice(pares)];
  for (let i = 0; i < sobra.length; i += 2) confrontos.push({ a: sobra[i], b: sobra[i + 1] });
  return confrontos;
}
