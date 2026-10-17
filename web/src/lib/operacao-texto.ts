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
  return `Atenção, quadra ${params.quadra}! ${params.categoriaNome}, ${params.etapa}: ${dupla(params.equipeA)}, contra ${dupla(
    params.equipeB
  )}. Dirijam-se à quadra ${params.quadra}.`;
}

export function textoProximo(params: { equipeA: AtletaTexto[]; equipeB: AtletaTexto[] }) {
  return `Preparem-se para o próximo jogo: ${dupla(params.equipeA)}, contra ${dupla(params.equipeB)}.`;
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
