import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, inscricoes, partidas, presencas, rodadas, torneios, usuarios } from "@/db/schema";
import { dataSP } from "@/services/presenca.service";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import {
  TAMANHOS_RODIZIO_COMPLETO,
  metasValidasAmericano,
  montarAmistoso,
  montarRodadasAmericano,
  montarRodadasRodizioCompleto,
  ordenarRanking,
  rodizioCompletoDisponivel,
  tamanhosRodizioProximos,
  type LinhaRankingAmericano,
  type RodadaAmericano,
} from "@/lib/americano";

/**
 * Americano (parceiro rotativo): cada atleta se inscreve sozinho; os jogos usam duplas montadas
 * so para aquele jogo (equipe sem inscricao, com os 2 atletas). O ranking e individual e a final
 * opcional junta 1º+4º contra 2º+3º.
 */

export class ErroAmericano extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const ENCERRADA = new Set(["FINALIZADA", "WO"]);

function partidaIniciada(p: { status: string; vencedorId: string | null; placarA: number | null; placarB: number | null }) {
  return p.status !== "AGENDADA" || Boolean(p.vencedorId) || (p.placarA ?? 0) !== 0 || (p.placarB ?? 0) !== 0;
}

export class AmericanoService {
  private async contexto(torneioId: string, categoriaId: string) {
    const [categoria] = await db
      .select({ id: categorias.id, torneioId: categorias.torneioId })
      .from(categorias)
      .where(eq(categorias.id, categoriaId))
      .limit(1);
    if (!categoria || categoria.torneioId !== torneioId) throw new ErroAmericano("Categoria inválida para o torneio", 404);
    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    if (config.formato !== "AMERICANO") throw new ErroAmericano("Esta categoria não está no formato Americano");
    return { config, americano: config.americano ?? { jogosPorAtleta: 6, final: true } };
  }

  /** Atletas com inscricao aprovada, na ordem de inscricao. */
  async atletasAprovados(categoriaId: string) {
    const rows = await db
      .select({ usuarioId: usuarios.id, nome: usuarios.nome, fotoUrl: usuarios.fotoUrl, dataInscricao: inscricoes.dataInscricao })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
      .where(and(eq(inscricoes.categoriaId, categoriaId), eq(inscricoes.status, "APROVADA")))
      .orderBy(asc(inscricoes.dataInscricao));
    return Array.from(new Map(rows.map((r) => [r.usuarioId, r])).values());
  }

  /** Equipe da dupla do jogo; reaproveita a mesma dupla se ela ja existir neste torneio. */
  private async equipeDaDupla(
    tx: any,
    torneioId: string,
    cache: Map<string, string>,
    dupla: [string, string]
  ): Promise<string> {
    const chave = [...dupla].sort().join("|");
    const existente = cache.get(chave);
    if (existente) return existente;
    const [equipe] = await tx.insert(equipes).values({ torneioId, capitaoUsuarioId: dupla[0] }).returning({ id: equipes.id });
    await tx.insert(equipeIntegrantes).values(dupla.map((usuarioId) => ({ equipeId: equipe.id, usuarioId })));
    cache.set(chave, equipe.id);
    return equipe.id;
  }

  /** Duplas (equipes de 2) ja usadas nos jogos desta categoria, por par de atletas. */
  private async duplasExistentes(categoriaId: string) {
    const jogos = await db
      .select({ a: partidas.equipeAId, b: partidas.equipeBId })
      .from(partidas)
      .where(eq(partidas.categoriaId, categoriaId));
    const ids = Array.from(new Set(jogos.flatMap((j) => [j.a, j.b])));
    const cache = new Map<string, string>();
    if (ids.length === 0) return cache;
    const integrantes = await db
      .select({ equipeId: equipeIntegrantes.equipeId, usuarioId: equipeIntegrantes.usuarioId })
      .from(equipeIntegrantes)
      .where(inArray(equipeIntegrantes.equipeId, ids));
    const porEquipe = new Map<string, string[]>();
    for (const i of integrantes) porEquipe.set(i.equipeId, [...(porEquipe.get(i.equipeId) ?? []), i.usuarioId]);
    for (const [equipeId, membros] of porEquipe) if (membros.length === 2) cache.set([...membros].sort().join("|"), equipeId);
    return cache;
  }

  /**
   * Gera (ou refaz) todas as rodadas. Recusa se algum jogo ja comecou.
   * `quadras` = quantos jogos acontecem ao mesmo tempo.
   */
  async gerarRodadas(params: { torneioId: string; categoriaId: string; quadras: number; jogosPorAtleta?: number }) {
    const { config, americano } = await this.contexto(params.torneioId, params.categoriaId);
    const existentes = await db
      .select({ id: partidas.id, status: partidas.status, vencedorId: partidas.vencedorId, placarA: partidas.placarA, placarB: partidas.placarB })
      .from(partidas)
      .where(eq(partidas.categoriaId, params.categoriaId));
    if (existentes.some(partidaIniciada)) {
      throw new ErroAmericano("Já existem jogos começados ou com resultado; não dá para refazer as rodadas.");
    }

    const atletas = await this.atletasAprovados(params.categoriaId);
    if (atletas.length < 4) throw new ErroAmericano("O Americano precisa de pelo menos 4 atletas aprovados.");

    let montadas: RodadaAmericano[];
    let jogosPorAtleta: number;
    if (americano.rodizioCompleto) {
      // tabela fixa: cada atleta joga uma vez com cada um dos outros
      if (!rodizioCompletoDisponivel(atletas.length)) {
        const { abaixo, acima } = tamanhosRodizioProximos(atletas.length);
        const sugestao = [abaixo, acima].filter((t, i, a) => t != null && a.indexOf(t) === i).join(" ou ");
        throw new ErroAmericano(
          `O rodízio completo fecha com ${TAMANHOS_RODIZIO_COMPLETO.join(", ")} atletas. Hoje são ${atletas.length} aprovados${sugestao ? ` (o mais próximo: ${sugestao})` : ""}. Ajuste as inscrições ou desligue o rodízio completo para usar o modo livre.`
        );
      }
      montadas = montarRodadasRodizioCompleto(atletas.map((a) => a.usuarioId));
      jogosPorAtleta = atletas.length - 1;
      // a meta de jogos acompanha a tabela (o replanejamento e o painel usam esse numero)
      if (americano.jogosPorAtleta !== jogosPorAtleta) {
        await categoriaConfigService.salvar(params.categoriaId, { ...config, americano: { ...americano, jogosPorAtleta } });
      }
    } else {
      jogosPorAtleta = params.jogosPorAtleta ?? americano.jogosPorAtleta;
      // cada jogo do ranking vale para os 4: atletas x jogos precisa ser multiplo de 4
      if ((atletas.length * jogosPorAtleta) % 4 !== 0) {
        const validas = metasValidasAmericano(atletas.length).filter((n) => n <= 12);
        throw new ErroAmericano(
          `Com ${atletas.length} atletas não dá para todos jogarem ${jogosPorAtleta} jogos válidos (cada jogo tem 4 vagas). Use ${validas.join(", ")} jogos por atleta.`
        );
      }
      montadas = montarRodadasAmericano({
        atletas: atletas.map((a) => a.usuarioId),
        quadras: params.quadras,
        jogosPorAtleta,
      });
    }
    const cache = await this.duplasExistentes(params.categoriaId);

    await db.transaction(async (tx) => {
      await tx.delete(partidas).where(eq(partidas.categoriaId, params.categoriaId));
      await tx.delete(rodadas).where(eq(rodadas.categoriaId, params.categoriaId));
      for (const r of montadas) {
        const [rodada] = await tx
          .insert(rodadas)
          .values({ torneioId: params.torneioId, categoriaId: params.categoriaId, nome: `Rodada ${r.numero}`, numero: r.numero })
          .returning({ id: rodadas.id });
        // um a um para que criado_em siga a ordem das rodadas (a fila da operacao usa essa ordem)
        for (const j of r.jogos) {
          const equipeAId = await this.equipeDaDupla(tx, params.torneioId, cache, j.a);
          const equipeBId = await this.equipeDaDupla(tx, params.torneioId, cache, j.b);
          await tx.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            rodadaId: rodada.id,
            grupoId: null,
            equipeAId,
            equipeBId,
            fase: "GRUPOS",
            status: "AGENDADA",
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
        }
      }
    });

    const totalJogos = montadas.reduce((s, r) => s + r.jogos.length, 0);
    return { atletas: atletas.length, rodadas: montadas.length, jogos: totalJogos, jogosPorAtleta, rodizioCompleto: Boolean(americano.rodizioCompleto) };
  }

  /**
   * Com o torneio rodando: se ha quadra livre e nenhum jogo pendente tem os 4 atletas livres,
   * remonta os jogos ainda nao chamados a partir de quem esta livre, mantendo a meta de jogos de cada
   * um e evitando repetir parceiro e adversario. Jogos encerrados, em quadra ou chamados ficam como estao.
   * Retorna true se replanejou.
   */
  async replanejarSeTravado(params: { torneioId: string; categoriaId: string }): Promise<boolean> {
    const config = await categoriaConfigService.obterOuDefault(params.categoriaId);
    if (config.formato !== "AMERICANO") return false;
    const meta = config.americano?.jogosPorAtleta ?? 6;
    // rodizio completo: a tabela e fixa. Remontar quebraria o "uma vez com cada parceiro" e um amistoso
    // seguraria atletas que o proximo jogo da tabela vai precisar
    if (config.americano?.rodizioCompleto === true) return false;

    return db.transaction(async (tx) => {
      // um replanejamento por vez (telao, operacao e celulares consultam ao mesmo tempo)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"americano:" + params.categoriaId}))`);

      const [torneio] = await tx.select({ quadrasAtivas: torneios.quadrasAtivas }).from(torneios).where(eq(torneios.id, params.torneioId)).limit(1);
      const doTorneio = await tx
        .select({ id: partidas.id, quadra: partidas.quadra, status: partidas.status, chamadoEm: partidas.chamadoEm })
        .from(partidas)
        .where(eq(partidas.torneioId, params.torneioId));
      const ocupamQuadra = doTorneio.filter((p) => p.quadra && (p.status === "EM_ANDAMENTO" || (p.status === "AGENDADA" && p.chamadoEm)));
      const quadrasLivres = Math.max(0, (torneio?.quadrasAtivas || 1) - ocupamQuadra.length);
      if (quadrasLivres === 0) return false;

      const jogos = await tx
        .select({
          id: partidas.id,
          fase: partidas.fase,
          status: partidas.status,
          chamadoEm: partidas.chamadoEm,
          vencedorId: partidas.vencedorId,
          placarA: partidas.placarA,
          placarB: partidas.placarB,
          finalizadoEm: partidas.finalizadoEm,
          rodadaId: partidas.rodadaId,
          equipeAId: partidas.equipeAId,
          equipeBId: partidas.equipeBId,
          amistoso: partidas.amistoso,
          adiadoAte: partidas.adiadoAte,
        })
        .from(partidas)
        .where(and(eq(partidas.categoriaId, params.categoriaId), eq(partidas.fase, "GRUPOS")));
      if (jogos.length === 0) return false;

      // jogo "pulado" na mesa continua de pe (conta para a meta), so fica fora das sugestoes por um tempo
      const adiado = (j: (typeof jogos)[number]) => Boolean(j.adiadoAte && new Date(j.adiadoAte).getTime() > Date.now());
      const livreParaRemontar = (j: (typeof jogos)[number]) => j.status === "AGENDADA" && !j.chamadoEm && !partidaIniciada(j) && !adiado(j);
      const pendentes = jogos.filter(livreParaRemontar);
      const fixos = jogos.filter((j) => !livreParaRemontar(j) && j.status !== "CANCELADA");

      const equipeIds = Array.from(new Set(jogos.flatMap((j) => [j.equipeAId, j.equipeBId])));
      const integrantes = await tx
        .select({ equipeId: equipeIntegrantes.equipeId, usuarioId: equipeIntegrantes.usuarioId })
        .from(equipeIntegrantes)
        .where(inArray(equipeIntegrantes.equipeId, equipeIds));
      const membros = new Map<string, string[]>();
      for (const i of integrantes) membros.set(i.equipeId, [...(membros.get(i.equipeId) ?? []), i.usuarioId]);
      const dupla = (equipeId: string) => membros.get(equipeId) ?? [];

      const emQuadra = new Set<string>();
      const acabaramDeJogar = new Set<string>();
      const contagem = new Map<string, number>();
      const parceiros: [string, string][] = [];
      const adversarios: [string, string][] = [];
      const recente = Date.now() - 15 * 60 * 1000;
      for (const j of fixos) {
        const a = dupla(j.equipeAId);
        const b = dupla(j.equipeBId);
        // amistoso ocupa a quadra mas nao conta jogo, parceiro nem adversario do ranking
        if (!j.amistoso) {
          for (const u of [...a, ...b]) contagem.set(u, (contagem.get(u) ?? 0) + 1);
          if (a.length === 2) parceiros.push([a[0], a[1]]);
          if (b.length === 2) parceiros.push([b[0], b[1]]);
          for (const x of a) for (const y of b) adversarios.push([x, y]);
        }
        const encerrado = j.status === "FINALIZADA" || j.status === "WO";
        if (adiado(j) && j.status === "AGENDADA" && !j.chamadoEm) continue;
        if (!encerrado) for (const u of [...a, ...b]) emQuadra.add(u);
        else if (j.finalizadoEm && new Date(j.finalizadoEm).getTime() >= recente) for (const u of [...a, ...b]) acabaramDeJogar.add(u);
      }

      // atleta pausado na mesa fica de fora como se estivesse em quadra
      const pausados = await tx
        .select({ usuarioId: presencas.usuarioId })
        .from(presencas)
        .where(and(eq(presencas.torneioId, params.torneioId), eq(presencas.data, dataSP()), eq(presencas.status, "AUSENTE")));
      for (const p of pausados) emQuadra.add(p.usuarioId);

      // travado = nenhum jogo pendente com os 4 livres
      const temJogoLivre = pendentes.some((j) => [...dupla(j.equipeAId), ...dupla(j.equipeBId)].every((u) => !emQuadra.has(u)));
      if (temJogoLivre) return false;

      const atletas = Array.from(new Set([...(await this.atletasAprovados(params.categoriaId)).map((a) => a.usuarioId), ...integrantes.map((i) => i.usuarioId)]));
      const livres = atletas.filter((u) => !emQuadra.has(u));
      if (livres.length < 4 || !atletas.some((u) => (contagem.get(u) ?? 0) < meta)) return false;

      const plano = montarRodadasAmericano({
        atletas,
        quadras: torneio?.quadrasAtivas || 1,
        jogosPorAtleta: meta,
        andamento: { jogos: contagem, parceiros, adversarios, emQuadra, acabaramDeJogar, quadrasLivres },
      });
      const cache = new Map<string, string>();
      for (const [equipeId, us] of membros) if (us.length === 2) cache.set([...us].sort().join("|"), equipeId);

      // nenhum jogo do ranking fecha com quem esta livre: amistoso para a quadra nao ficar parada
      if (plano[0]?.numero !== 1) {
        if (pendentes.some((j) => j.amistoso)) return false;
        const quantos = Math.min(quadrasLivres, Math.floor(livres.length / 4));
        if (quantos === 0) return false;
        // primeiro quem ja completou os jogos do ranking, depois quem descansou mais
        const ordem = livres
          .map((u) => ({ u, completo: (contagem.get(u) ?? 0) >= meta, recente: acabaramDeJogar.has(u), sorte: Math.random() }))
          .sort((x, y) => Number(y.completo) - Number(x.completo) || Number(x.recente) - Number(y.recente) || x.sorte - y.sorte)
          .map((x) => x.u);
        for (let g = 0; g < quantos; g++) {
          const quatro = ordem.slice(g * 4, g * 4 + 4) as [string, string, string, string];
          const jogo = montarAmistoso(quatro, parceiros);
          const equipeAId = await this.equipeDaDupla(tx, params.torneioId, cache, jogo.a);
          const equipeBId = await this.equipeDaDupla(tx, params.torneioId, cache, jogo.b);
          await tx.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            grupoId: null,
            equipeAId,
            equipeBId,
            fase: "GRUPOS",
            status: "AGENDADA",
            amistoso: true,
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
        }
        return true;
      }

      if (pendentes.length > 0) await tx.delete(partidas).where(inArray(partidas.id, pendentes.map((p) => p.id)));
      const rodadasUsadas = new Set(fixos.map((j) => j.rodadaId).filter(Boolean) as string[]);
      const existentes = await tx.select({ id: rodadas.id, numero: rodadas.numero }).from(rodadas).where(eq(rodadas.categoriaId, params.categoriaId));
      const sobrando = existentes.filter((r) => !rodadasUsadas.has(r.id)).map((r) => r.id);
      if (sobrando.length > 0) await tx.delete(rodadas).where(inArray(rodadas.id, sobrando));
      let proximoNumero = Math.max(0, ...existentes.filter((r) => rodadasUsadas.has(r.id)).map((r) => r.numero ?? 0)) + 1;

      for (const r of plano) {
        const [rodada] = await tx
          .insert(rodadas)
          .values({ torneioId: params.torneioId, categoriaId: params.categoriaId, nome: `Rodada ${proximoNumero}`, numero: proximoNumero })
          .returning({ id: rodadas.id });
        proximoNumero += 1;
        for (const j of r.jogos) {
          const equipeAId = await this.equipeDaDupla(tx, params.torneioId, cache, j.a);
          const equipeBId = await this.equipeDaDupla(tx, params.torneioId, cache, j.b);
          await tx.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            rodadaId: rodada.id,
            grupoId: null,
            equipeAId,
            equipeBId,
            fase: "GRUPOS",
            status: "AGENDADA",
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
        }
      }
      return true;
    });
  }

  /** Ranking individual a partir dos jogos encerrados da fase de rodadas. */
  async ranking(categoriaId: string): Promise<{ linhas: (LinhaRankingAmericano & { posicao: number })[]; jogosTotal: number; jogosEncerrados: number }> {
    const atletas = await this.atletasAprovados(categoriaId);
    const jogos = await db
      .select({
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        vencedorId: partidas.vencedorId,
        status: partidas.status,
        detalhesPlacar: partidas.detalhesPlacar,
      })
      .from(partidas)
      .where(and(eq(partidas.categoriaId, categoriaId), eq(partidas.fase, "GRUPOS"), eq(partidas.amistoso, false)));

    const linhas = new Map<string, LinhaRankingAmericano>(
      atletas.map((a) => [a.usuarioId, { usuarioId: a.usuarioId, nome: a.nome, fotoUrl: a.fotoUrl ?? null, jogos: 0, vitorias: 0, gamesPro: 0, gamesContra: 0, saldo: 0 }])
    );

    const encerrados = jogos.filter((j) => ENCERRADA.has(j.status));
    const equipeIds = Array.from(new Set(encerrados.flatMap((j) => [j.equipeAId, j.equipeBId])));
    const membros = new Map<string, string[]>();
    if (equipeIds.length > 0) {
      const rows = await db
        .select({ equipeId: equipeIntegrantes.equipeId, usuarioId: equipeIntegrantes.usuarioId, nome: usuarios.nome, fotoUrl: usuarios.fotoUrl })
        .from(equipeIntegrantes)
        .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
        .where(inArray(equipeIntegrantes.equipeId, equipeIds));
      for (const r of rows) {
        membros.set(r.equipeId, [...(membros.get(r.equipeId) ?? []), r.usuarioId]);
        // atleta que jogou mas saiu das inscricoes continua no ranking
        if (!linhas.has(r.usuarioId)) {
          linhas.set(r.usuarioId, { usuarioId: r.usuarioId, nome: r.nome, fotoUrl: r.fotoUrl ?? null, jogos: 0, vitorias: 0, gamesPro: 0, gamesContra: 0, saldo: 0 });
        }
      }
    }

    for (const j of encerrados) {
      const sets = Array.isArray(j.detalhesPlacar) ? j.detalhesPlacar : [];
      const gamesA = sets.reduce((s, x) => s + (Number(x.a) || 0), 0);
      const gamesB = sets.reduce((s, x) => s + (Number(x.b) || 0), 0);
      for (const [equipeId, pro, contra] of [
        [j.equipeAId, gamesA, gamesB],
        [j.equipeBId, gamesB, gamesA],
      ] as const) {
        for (const usuarioId of membros.get(equipeId) ?? []) {
          const l = linhas.get(usuarioId)!;
          l.jogos += 1;
          if (j.vencedorId === equipeId) l.vitorias += 1;
          l.gamesPro += pro;
          l.gamesContra += contra;
          l.saldo = l.gamesPro - l.gamesContra;
        }
      }
    }

    const ordenado = ordenarRanking(Array.from(linhas.values())).map((l, i) => ({ ...l, posicao: i + 1 }));
    return { linhas: ordenado, jogosTotal: jogos.length, jogosEncerrados: encerrados.length };
  }

  /**
   * Depois de todas as rodadas encerradas:
   * - sem semifinal: final balanceada 1º+4º contra 2º+3º do ranking;
   * - com semifinal (8 primeiros): semis 1º+8º x 4º+5º e 2º+7º x 3º+6º. A final sai sozinha quando as
   *   duas semis terminam (mesma regra do mata-mata); se faltar, este passo monta com os vencedores.
   */
  async gerarFinal(params: { torneioId: string; categoriaId: string }): Promise<{
    fase: "SEMI" | "FINAL";
    duplaA: string[];
    duplaB: string[];
    semis?: { duplaA: string[]; duplaB: string[] }[];
  }> {
    const { americano } = await this.contexto(params.torneioId, params.categoriaId);
    if (!americano.final) throw new ErroAmericano("Esta categoria foi configurada sem final.");

    const jogos = await db
      .select({ id: partidas.id, fase: partidas.fase, status: partidas.status, vencedorId: partidas.vencedorId, placarA: partidas.placarA, placarB: partidas.placarB, amistoso: partidas.amistoso, equipeAId: partidas.equipeAId, equipeBId: partidas.equipeBId })
      .from(partidas)
      .where(eq(partidas.categoriaId, params.categoriaId));
    const rodadasJogos = jogos.filter((j) => j.fase === "GRUPOS" && !j.amistoso);
    if (rodadasJogos.length === 0) throw new ErroAmericano("Gere as rodadas antes da final.");
    const faltam = rodadasJogos.filter((j) => !ENCERRADA.has(j.status)).length;
    if (faltam > 0) throw new ErroAmericano(`Ainda ${faltam === 1 ? "falta 1 jogo" : `faltam ${faltam} jogos`} das rodadas.`);
    const finais = jogos.filter((j) => j.fase === "FINAL");
    if (finais.some(partidaIniciada)) throw new ErroAmericano("A final já começou.");

    const { linhas } = await this.ranking(params.categoriaId);
    const cache = await this.duplasExistentes(params.categoriaId);

    if (americano.semifinal) {
      const semis = jogos.filter((j) => j.fase === "SEMI");
      if (semis.some(partidaIniciada)) {
        const pendentes = semis.filter((j) => !ENCERRADA.has(j.status) || !j.vencedorId);
        if (pendentes.length > 0) throw new ErroAmericano("As semifinais ainda não terminaram. A final sai sozinha quando acabarem.");
        // semis encerradas e a final nao saiu: monta com os vencedores
        const [s1, s2] = semis;
        const nomes = await this.nomesDasDuplas([s1.vencedorId!, s2.vencedorId!]);
        await db.transaction(async (tx) => {
          if (finais.length > 0) await tx.delete(partidas).where(inArray(partidas.id, finais.map((f) => f.id)));
          await tx.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            grupoId: null,
            equipeAId: s1.vencedorId!,
            equipeBId: s2.vencedorId!,
            fase: "FINAL",
            status: "AGENDADA",
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
        });
        return { fase: "FINAL", duplaA: nomes.get(s1.vencedorId!) ?? [], duplaB: nomes.get(s2.vencedorId!) ?? [] };
      }

      if (linhas.length < 8) throw new ErroAmericano("A semifinal precisa de 8 atletas no ranking.");
      const p = linhas.slice(0, 8);
      const confrontos: [[number, number], [number, number]][] = [
        [[0, 7], [3, 4]],
        [[1, 6], [2, 5]],
      ];
      await db.transaction(async (tx) => {
        const refazer = [...semis, ...finais].map((j) => j.id);
        if (refazer.length > 0) await tx.delete(partidas).where(inArray(partidas.id, refazer));
        for (let i = 0; i < confrontos.length; i++) {
          const [[a1, a2], [b1, b2]] = confrontos[i];
          const equipeAId = await this.equipeDaDupla(tx, params.torneioId, cache, [p[a1].usuarioId, p[a2].usuarioId]);
          const equipeBId = await this.equipeDaDupla(tx, params.torneioId, cache, [p[b1].usuarioId, p[b2].usuarioId]);
          await tx.insert(partidas).values({
            torneioId: params.torneioId,
            categoriaId: params.categoriaId,
            grupoId: null,
            equipeAId,
            equipeBId,
            fase: "SEMI",
            posicaoChave: i + 1,
            status: "AGENDADA",
            placarA: 0,
            placarB: 0,
            atualizadoEm: new Date(),
          });
        }
      });
      const semisNomes = confrontos.map(([[a1, a2], [b1, b2]]) => ({ duplaA: [p[a1].nome, p[a2].nome], duplaB: [p[b1].nome, p[b2].nome] }));
      return { fase: "SEMI", duplaA: semisNomes[0].duplaA, duplaB: semisNomes[0].duplaB, semis: semisNomes };
    }

    if (linhas.length < 4) throw new ErroAmericano("A final precisa de 4 atletas no ranking.");
    const [p1, p2, p3, p4] = linhas;

    await db.transaction(async (tx) => {
      if (finais.length > 0) await tx.delete(partidas).where(inArray(partidas.id, finais.map((f) => f.id)));
      const equipeAId = await this.equipeDaDupla(tx, params.torneioId, cache, [p1.usuarioId, p4.usuarioId]);
      const equipeBId = await this.equipeDaDupla(tx, params.torneioId, cache, [p2.usuarioId, p3.usuarioId]);
      await tx.insert(partidas).values({
        torneioId: params.torneioId,
        categoriaId: params.categoriaId,
        grupoId: null,
        equipeAId,
        equipeBId,
        fase: "FINAL",
        status: "AGENDADA",
        placarA: 0,
        placarB: 0,
        atualizadoEm: new Date(),
      });
    });

    return { fase: "FINAL", duplaA: [p1.nome, p4.nome], duplaB: [p2.nome, p3.nome] };
  }

  private async nomesDasDuplas(equipeIds: string[]) {
    const rows = await db
      .select({ equipeId: equipeIntegrantes.equipeId, nome: usuarios.nome })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));
    const nomes = new Map<string, string[]>();
    for (const r of rows) nomes.set(r.equipeId, [...(nomes.get(r.equipeId) ?? []), r.nome]);
    return nomes;
  }
}

export const americanoService = new AmericanoService();
