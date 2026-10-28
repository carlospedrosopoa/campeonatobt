// Data limite da rodada (super campeonato): vale o dia inteiro, no horario de Brasilia.

const FUSO = "America/Sao_Paulo";

function diaSP(d: Date) {
  // "2026-11-01" no fuso de Brasilia (en-CA formata como AAAA-MM-DD)
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

// Mensagem de erro quando o horario passa da data limite da rodada; null quando esta dentro do prazo
export function erroForaDoPrazo(dataHorario: Date, limiteRodada: Date | null | undefined) {
  if (!limiteRodada) return null;
  if (diaSP(dataHorario) <= diaSP(limiteRodada)) return null;
  const dataFormatada = limiteRodada.toLocaleDateString("pt-BR", { timeZone: FUSO });
  return `O jogo precisa ser agendado até a data limite da rodada (${dataFormatada}).`;
}
