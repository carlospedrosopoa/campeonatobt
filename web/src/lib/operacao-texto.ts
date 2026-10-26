/** Textos da operacao ao vivo (chamadas do locutor). Sem dependencia de banco: usado no telao. */
type AtletaTexto = { nome: string };

export function nomeLocucao(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] ?? "";
}

const dupla = (lista: AtletaTexto[]) => lista.map((a) => nomeLocucao(a.nome)).join(" e ");

export function textoChamada(params: {
  quadra: number;
  categoriaNome: string;
  etapa: string;
  equipeA: AtletaTexto[];
  equipeB: AtletaTexto[];
}) {
  // curta e direta, dita duas vezes: "Carlos Silva e João Souza contra André Lima e Mário Rosa, quadra 2"
  const frase = `${dupla(params.equipeA)} contra ${dupla(params.equipeB)}, quadra ${params.quadra}.`;
  return `${frase} ${frase}`;
}

export function textoProximo(params: { equipeA: AtletaTexto[]; equipeB: AtletaTexto[] }) {
  return `Próximo jogo: ${dupla(params.equipeA)} contra ${dupla(params.equipeB)}.`;
}

/** Resposta padrao quando o torneio nao habilitou a operacao ao vivo. */
export function operacaoDesabilitada() {
  return Response.json(
    { error: "Operação ao vivo desabilitada neste torneio. Habilite em Dados do torneio.", code: "OPERACAO_DESABILITADA" },
    { status: 403 }
  );
}

export function textoResultado(params: { quadra: number | null; vencedora: AtletaTexto[]; sets: string[]; wo: boolean }) {
  const onde = params.quadra ? `Fim de jogo na quadra ${params.quadra}` : "Fim de jogo";
  const placar = params.wo ? "por W.O" : params.sets.length ? `por ${params.sets.join(", ")}` : "";
  return `${onde}: ${dupla(params.vencedora)} ${params.vencedora.length > 1 ? "vencem" : "vence"} ${placar}.`.replace(/\s+\./, ".");
}

/** Chamada feita sem quadra (pela conferencia de presenca). */
export function textoChamadaSemQuadra(params: { categoriaNome: string; etapa: string; equipeA: AtletaTexto[]; equipeB: AtletaTexto[] }) {
  const frase = `${dupla(params.equipeA)} contra ${dupla(params.equipeB)}, apresentem-se.`;
  return `${frase} ${frase}`;
}

export function textoInicioAquecimento(params: { quadra: number; minutos: number }) {
  return `Quadra ${params.quadra}, aquecimento ${params.minutos} ${params.minutos === 1 ? "minuto" : "minutos"}.`;
}

export function textoFimAquecimento(params: { quadra: number }) {
  return `Play na quadra ${params.quadra}! Bom jogo!`;
}

/** Repeticao da chamada: a frase curta e gerada uma vez e o audio da chamada e reaproveitado. */
export const PREFIXO_REPETICAO = ["Segunda chamada!", "Última chamada!"] as const;
