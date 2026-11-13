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
    // jogo do ranking vale para os 4: so entra quem ainda precisa jogar (ninguem completa jogo)
    const candidatos = primeiraComAndamento ? faltando.filter((a) => !and!.emQuadra.has(a)) : faltando;
    const quadrasRodada = primeiraComAndamento ? and!.quadrasLivres : quadras;
    const jogosNaRodada = Math.min(quadrasRodada, Math.floor(candidatos.length / 4));
    if (jogosNaRodada <= 0) {
      if (primeiraComAndamento) {
        for (const a of and!.emQuadra) ultimaRodada.set(a, numero);
        rodadas.push({ numero, jogos: [] });
        continue;
      }
      break; // nao fecha mais jogo valido (so acontece com a ordem muito desviada do plano)
    }

    // quem joga: primeiro os que tem menos jogos (obrigatorios); as vagas que sobram saem do proximo
    // nivel, escolhidas junto com a divisao das duplas para variar parceiros e adversarios
    const vagas = jogosNaRodada * 4;
    const porJogos = new Map<number, string[]>();
    for (const a of candidatos) porJogos.set(jogos.get(a)!, [...(porJogos.get(jogos.get(a)!) ?? []), a]);
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

/**
 * Para todos jogarem exatamente N jogos validos, atletas x N precisa ser multiplo de 4
 * (cada jogo tem 4 vagas). Devolve os valores de N possiveis ate 30.
 */
export function metasValidasAmericano(atletas: number) {
  return Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => (atletas * n) % 4 === 0);
}

/** Amistoso: divide 4 atletas em 2 duplas repetindo o minimo de parceiros ja usados. */
export function montarAmistoso(quatro: [string, string, string, string], parceirosUsados: [string, string][], aleatorio: () => number = Math.random): JogoAmericano {
  const usados = new Set(parceirosUsados.map(([x, y]) => chave(x, y)));
  const opcoes: [number, number, number, number][] = embaralhar(
    [
      [0, 1, 2, 3],
      [0, 2, 1, 3],
      [0, 3, 1, 2],
    ],
    aleatorio
  );
  const custo = ([i, j, k, l]: [number, number, number, number]) =>
    Number(usados.has(chave(quatro[i], quatro[j]))) + Number(usados.has(chave(quatro[k], quatro[l])));
  const [i, j, k, l] = opcoes.sort((x, y) => custo(x) - custo(y))[0];
  return { a: [quatro[i], quatro[j]], b: [quatro[k], quatro[l]] };
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

/**
 * Rodizio completo (como o Super 8 / Super 12): cada atleta joga exatamente uma vez com cada um dos
 * outros como parceiro e enfrenta cada um exatamente 2 vezes. So fecha com 4n ou 4n+1 atletas; com
 * 4n+1, um atleta descansa em cada rodada. As tabelas saem de uma rodada base "girada" (torneio whist
 * ciclico): com 4n atletas, os numeros 0..v-2 giram e o "I" fica parado; com 4n+1, todos giram.
 */
type BaseRodizio = { tipo: "CICLICO"; base: (number | "I")[][] } | { tipo: "Z3xZ3"; base: number[][] };

const BASES_RODIZIO: Record<number, BaseRodizio> = {
  4: { tipo: "CICLICO", base: [["I", 0, 1, 2]] },
  5: { tipo: "CICLICO", base: [[2, 3, 1, 4]] },
  8: { tipo: "CICLICO", base: [["I", 3, 0, 1], [6, 4, 5, 2]] },
  9: { tipo: "Z3xZ3", base: [[1, 2, 3, 6], [4, 8, 5, 7]] },
  12: { tipo: "CICLICO", base: [[5, 6, 1, 8], [10, "I", 2, 0], [9, 3, 4, 7]] },
  13: { tipo: "CICLICO", base: [[6, 8, 3, 4], [7, 2, 10, 1], [11, 5, 12, 9]] },
  16: { tipo: "CICLICO", base: [[7, 3, 12, 4], [2, 8, 14, 0], ["I", 6, 5, 10], [9, 11, 1, 13]] },
  17: { tipo: "CICLICO", base: [[10, 5, 11, 13], [12, 15, 4, 8], [3, 2, 1, 7], [6, 14, 9, 16]] },
  20: { tipo: "CICLICO", base: [[1, 7, 14, 5], [17, 2, 16, 9], [13, 11, "I", 8], [3, 6, 4, 12], [15, 10, 0, 18]] },
  21: { tipo: "CICLICO", base: [[14, 2, 10, 3], [19, 17, 5, 4], [20, 16, 1, 11], [13, 8, 6, 9], [12, 18, 7, 15]] },
};

/** Quantidades de atletas com rodizio completo disponivel. */
export const TAMANHOS_RODIZIO_COMPLETO = Object.keys(BASES_RODIZIO)
  .map(Number)
  .sort((a, b) => a - b);

export function rodizioCompletoDisponivel(atletas: number) {
  return Boolean(BASES_RODIZIO[atletas]);
}

/** Quantidades validas mais proximas (abaixo e acima) para sugerir ao organizador. */
export function tamanhosRodizioProximos(atletas: number) {
  const abaixo = TAMANHOS_RODIZIO_COMPLETO.filter((t) => t <= atletas).pop() ?? null;
  const acima = TAMANHOS_RODIZIO_COMPLETO.find((t) => t >= atletas) ?? null;
  return { abaixo, acima };
}

/** Tabela de rodadas em indices 0..v-1 (cada jogo: [a1, a2, b1, b2]). */
export function tabelaRodizioCompleto(v: number): [number, number, number, number][][] {
  const def = BASES_RODIZIO[v];
  if (!def) throw new Error(`Rodízio completo não disponível para ${v} atletas`);
  const rodadas: [number, number, number, number][][] = [];
  if (def.tipo === "Z3xZ3") {
    const somar = (x: number, r: number) => (((x % 3) + (r % 3)) % 3) + 3 * ((Math.floor(x / 3) + Math.floor(r / 3)) % 3);
    for (let r = 0; r < 9; r++) rodadas.push(def.base.map((j) => j.map((x) => somar(x, r)) as [number, number, number, number]));
    return rodadas;
  }
  const m = v % 4 === 0 ? v - 1 : v;
  for (let r = 0; r < m; r++) {
    rodadas.push(def.base.map((j) => j.map((x) => (x === "I" ? m : (x + r) % m)) as [number, number, number, number]));
  }
  return rodadas;
}

/** Monta as rodadas do rodizio completo sorteando qual atleta ocupa cada posicao da tabela. */
export function montarRodadasRodizioCompleto(atletasIds: string[], aleatorio: () => number = Math.random): RodadaAmericano[] {
  const atletas = Array.from(new Set(atletasIds));
  const tabela = tabelaRodizioCompleto(atletas.length);
  const sorteio = embaralhar(atletas, aleatorio);
  return tabela.map((jogos, i) => ({
    numero: i + 1,
    jogos: jogos.map(([a1, a2, b1, b2]) => ({ a: [sorteio[a1], sorteio[a2]], b: [sorteio[b1], sorteio[b2]] })),
  }));
}
