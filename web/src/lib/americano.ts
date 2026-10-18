/**
 * Americano (parceiro rotativo): monta as rodadas para que cada atleta jogue `jogosPorAtleta` vezes,
 * trocando de parceiro e de adversarios o maximo possivel. Cada rodada usa ate `quadras` jogos
 * com atletas diferentes; quem esta ha mais tempo sem jogar entra primeiro.
 */

export type JogoAmericano = { a: [string, string]; b: [string, string] };
export type RodadaAmericano = { numero: number; jogos: JogoAmericano[] };

const PESO_PARCEIRO = 10;
const PESO_ADVERSARIO = 2;
/** jogar duas rodadas seguidas pesa um pouco: prefere quem descansou */
const PESO_SEGUIDO = 3;

function chave(x: string, y: string) {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function embaralhar<T>(lista: T[], aleatorio: () => number) {
  const c = lista.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

export function montarRodadasAmericano(params: {
  atletas: string[];
  quadras: number;
  jogosPorAtleta: number;
  aleatorio?: () => number;
  /**
   * Replanejamento com o torneio em andamento: jogos ja feitos (contando os em quadra), duplas e
   * adversarios que ja aconteceram, quem esta em quadra agora (fica fora da 1a rodada, como se
   * estivesse jogando nela), quem acabou de jogar e quantas quadras estao livres agora.
   */
  andamento?: {
    jogos: Map<string, number>;
    parceiros: [string, string][];
    adversarios: [string, string][];
    emQuadra: Set<string>;
    acabaramDeJogar: Set<string>;
    quadrasLivres: number;
  };
}): RodadaAmericano[] {
  const atletas = Array.from(new Set(params.atletas));
  const aleatorio = params.aleatorio ?? Math.random;
  if (atletas.length < 4) throw new Error("O Americano precisa de pelo menos 4 atletas");
  const quadras = Math.max(1, Math.min(Math.trunc(params.quadras) || 1, Math.floor(atletas.length / 4)));
  const meta = Math.max(1, Math.trunc(params.jogosPorAtleta) || 1);

  const and = params.andamento;
  const jogos = new Map<string, number>(atletas.map((a) => [a, and?.jogos.get(a) ?? 0]));
  // em quadra conta como jogando na rodada 1; quem acabou de jogar, na rodada 0
  const ultimaRodada = new Map<string, number>(
    atletas.map((a) => [a, and?.emQuadra.has(a) ? 1 : and?.acabaramDeJogar.has(a) ? 0 : -1])
  );
  const parceiros = new Map<string, number>();
  const adversarios = new Map<string, number>();
  const conta = (m: Map<string, number>, x: string, y: string) => m.get(chave(x, y)) ?? 0;
  const soma = (m: Map<string, number>, x: string, y: string) => m.set(chave(x, y), conta(m, x, y) + 1);
  for (const [x, y] of and?.parceiros ?? []) soma(parceiros, x, y);
  for (const [x, y] of and?.adversarios ?? []) soma(adversarios, x, y);

  /** melhor das 3 formas de dividir 4 atletas em 2 duplas */
  const melhorJogo = (q: string[]): { jogo: JogoAmericano; custo: number } => {
    const opcoes: [number, number, number, number][] = [
      [0, 1, 2, 3],
      [0, 2, 1, 3],
      [0, 3, 1, 2],
    ];
    let melhor: { jogo: JogoAmericano; custo: number } | null = null;
    for (const [i, j, k, l] of embaralhar(opcoes, aleatorio)) {
      const a: [string, string] = [q[i], q[j]];
      const b: [string, string] = [q[k], q[l]];
      const custo =
        PESO_PARCEIRO * (conta(parceiros, a[0], a[1]) + conta(parceiros, b[0], b[1])) +
        PESO_ADVERSARIO * (conta(adversarios, a[0], b[0]) + conta(adversarios, a[0], b[1]) + conta(adversarios, a[1], b[0]) + conta(adversarios, a[1], b[1]));
      if (!melhor || custo < melhor.custo) melhor = { jogo: { a, b }, custo };
    }
    return melhor!;
  };

  const rodadas: RodadaAmericano[] = [];
  for (let numero = 1; numero <= 500; numero++) {
    const faltando = atletas.filter((a) => jogos.get(a)! < meta);
    if (faltando.length === 0) break;
    // na 1a rodada do replanejamento: so as quadras livres e so quem nao esta em quadra
    const primeiraComAndamento = Boolean(and) && numero === 1;
    const disponiveis = primeiraComAndamento ? atletas.filter((a) => !and!.emQuadra.has(a)) : atletas;
    const quadrasRodada = primeiraComAndamento ? Math.min(and!.quadrasLivres, Math.floor(disponiveis.length / 4)) : quadras;
    const faltandoDisp = faltando.filter((a) => disponiveis.includes(a));
    if (quadrasRodada <= 0 || faltandoDisp.length === 0) {
      if (primeiraComAndamento) {
        for (const a of and!.emQuadra) ultimaRodada.set(a, numero);
        rodadas.push({ numero, jogos: [] });
        continue;
      }
      break;
    }

    // quantos jogos nesta rodada: o suficiente para quem ainda precisa jogar, ate o limite de quadras
    const jogosNaRodada = Math.max(1, Math.min(quadrasRodada, Math.ceil(faltandoDisp.length / 4)));
    // quem joga: primeiro os que tem menos jogos (obrigatorios); as vagas que sobram saem do proximo
    // nivel, escolhidas junto com a divisao das duplas para variar parceiros e adversarios
    const vagas = jogosNaRodada * 4;
    const porJogos = new Map<number, string[]>();
    for (const a of disponiveis) porJogos.set(jogos.get(a)!, [...(porJogos.get(jogos.get(a)!) ?? []), a]);
    const niveis = Array.from(porJogos.keys()).sort((x, y) => x - y);
    const obrigatorios: string[] = [];
    let opcionais: string[] = [];
    for (const n of niveis) {
      const grupo = porJogos.get(n)!;
      if (obrigatorios.length + grupo.length <= vagas) obrigatorios.push(...grupo);
      else {
        opcionais = grupo;
        break;
      }
    }

    // divide os escolhidos em grupos de 4 buscando o menor custo de parceiro e adversario repetidos
    let melhor: { jogos: JogoAmericano[]; custo: number } | null = null;
    for (let t = 0; t < 400; t++) {
      const escolhidos = [...obrigatorios, ...embaralhar(opcionais, aleatorio).slice(0, vagas - obrigatorios.length)];
      const mistura = embaralhar(escolhidos, aleatorio);
      const lista: JogoAmericano[] = [];
      let custo = PESO_SEGUIDO * escolhidos.filter((x) => ultimaRodada.get(x) === numero - 1).length;
      for (let g = 0; g < jogosNaRodada; g++) {
        const m = melhorJogo(mistura.slice(g * 4, g * 4 + 4));
        lista.push(m.jogo);
        custo += m.custo;
      }
      if (!melhor || custo < melhor.custo) melhor = { jogos: lista, custo };
      if (custo === 0 && t > 20) break;
    }

    for (const j of melhor!.jogos) {
      for (const x of [...j.a, ...j.b]) {
        jogos.set(x, jogos.get(x)! + 1);
        ultimaRodada.set(x, numero);
      }
      soma(parceiros, j.a[0], j.a[1]);
      soma(parceiros, j.b[0], j.b[1]);
      for (const x of j.a) for (const y of j.b) soma(adversarios, x, y);
    }
    rodadas.push({ numero, jogos: melhor!.jogos });
  }
  return rodadas.filter((r) => r.jogos.length > 0);
}

export type LinhaRankingAmericano = {
  usuarioId: string;
  nome: string;
  fotoUrl: string | null;
  jogos: number;
  vitorias: number;
  gamesPro: number;
  gamesContra: number;
  saldo: number;
};

/** Ranking individual: games vencidos, depois saldo de games, depois vitorias. */
export function ordenarRanking(linhas: LinhaRankingAmericano[]) {
  return linhas
    .slice()
    .sort((x, y) => y.gamesPro - x.gamesPro || y.saldo - x.saldo || y.vitorias - x.vitorias || x.nome.localeCompare(y.nome, "pt-BR"));
}
