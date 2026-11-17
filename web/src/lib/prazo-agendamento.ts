// Data limite da rodada (super campeonato): vale o dia inteiro, no horario de Brasilia.

const FUSO = "America/Sao_Paulo";

function diaSP(d: Date) {
  // "2026-11-01" no fuso de Brasilia (en-CA formata como AAAA-MM-DD)
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

// A data limite e escolhida como um dia e gravada a meia-noite UTC (01/11 00:00 UTC = 31/10 21h em Brasilia).
// Nesse caso o dia certo e a data UTC; com outro horario, vale o dia em Brasilia.
function diaDoLimite(limite: Date) {
  const meiaNoiteUtc = limite.getUTCHours() === 0 && limite.getUTCMinutes() === 0 && limite.getUTCSeconds() === 0;
  return meiaNoiteUtc ? limite.toISOString().slice(0, 10) : diaSP(limite);
}

// Mensagem de erro quando o horario passa da data limite da rodada; null quando esta dentro do prazo
export function erroForaDoPrazo(dataHorario: Date, limiteRodada: Date | null | undefined) {
  if (!limiteRodada) return null;
  const dia = diaDoLimite(limiteRodada);
  if (diaSP(dataHorario) <= dia) return null;
  const [a, m, d] = dia.split("-");
  return `O jogo precisa ser agendado até a data limite da rodada (${d}/${m}/${a}).`;
}
