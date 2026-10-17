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
