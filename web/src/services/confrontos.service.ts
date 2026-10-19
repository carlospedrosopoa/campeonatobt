import { db } from "@/db";
import { categorias, equipeIntegrantes, partidas, torneios, usuarios } from "@/db/schema";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

type Set = { a: number; b: number };
type AtletaInfo = { id: string; nome: string; fotoUrl: string | null };

/** Jogo encerrado visto do lado de uma dupla: quem estava de cada lado e o resultado. */
type JogoHistorico = {
  partidaId: string;
  torneioNome: string;
  categoriaNome: string;
  fase: string;
  data: string | null;
  wo: boolean;
  ladoA: string[];
  ladoB: string[];
  vencedorLado: "A" | "B";
  sets: Set[];
};

export type ResultadoConfronto = {
  /** perspectiva da dupla A do jogo consultado */
  vitorias: number;
  derrotas: number;
  setsPro: number;
  setsContra: number;
  gamesPro: number;
  gamesContra: number;
  jogos: { torneioNome: string; categoriaNome: string; fase: string; data: string | null; venceu: boolean; placar: string; wo: boolean }[];
};

export type ConfrontoPartida = {
  duplaA: AtletaInfo[];
  duplaB: AtletaInfo[];
  /** mesmas duas duplas frente a frente, em qualquer torneio */
  duplas: ResultadoConfronto;
  /** cada atleta da dupla A contra cada atleta da dupla B, com qualquer parceiro */
  atletas: { atletaA: string; atletaB: string; resultado: ResultadoConfronto }[];
  /** retrospecto de cada dupla jogando junta */
  juntos: { A: ResultadoConfronto; B: ResultadoConfronto };
  /** ultimos resultados de cada atleta (mais recente primeiro) */
  forma: Record<string, ("V" | "D")[]>;
};

const mesmoConjunto = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));

function placarTexto(sets: Set[], inverter: boolean) {
  return sets.map((s) => (inverter ? `${s.b}-${s.a}` : `${s.a}-${s.b}`)).join(" ");
}

function vazio(): ResultadoConfronto {
  return { vitorias: 0, derrotas: 0, setsPro: 0, setsContra: 0, gamesPro: 0, gamesContra: 0, jogos: [] };
}

/** Soma o jogo no resultado, do ponto de vista de quem esta em `meuLado`. */
function somar(r: ResultadoConfronto, j: JogoHistorico, meuLado: "A" | "B") {
  const venceu = j.vencedorLado === meuLado;
  const inverter = meuLado === "B";
  if (venceu) r.vitorias += 1;
  else r.derrotas += 1;
  // W.O. conta o resultado, mas nao soma sets e games
  if (!j.wo) {
    for (const s of j.sets) {
      const pro = inverter ? s.b : s.a;
      const contra = inverter ? s.a : s.b;
      r.gamesPro += pro;
      r.gamesContra += contra;
      if (pro > contra) r.setsPro += 1;
      else if (contra > pro) r.setsContra += 1;
    }
  }
  r.jogos.push({
    torneioNome: j.torneioNome,
    categoriaNome: j.categoriaNome,
    fase: j.fase,
    data: j.data,
    venceu,
    placar: j.wo ? "W.O." : placarTexto(j.sets, inverter),
    wo: j.wo,
  });
}

export class ConfrontosService {
  /** Historico entre as duplas e os atletas de uma partida, so com jogos encerrados de torneios visiveis. */
  async daPartida(partidaId: string): Promise<ConfrontoPartida | null> {
    const [partida] = await db
      .select({ id: partidas.id, equipeAId: partidas.equipeAId, equipeBId: partidas.equipeBId })
      .from(partidas)
      .where(eq(partidas.id, partidaId))
      .limit(1);
    if (!partida) return null;

    const integrantesDaPartida = await db
      .select({ equipeId: equipeIntegrantes.equipeId, id: usuarios.id, nome: usuarios.nome, fotoUrl: usuarios.fotoUrl })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
      .where(inArray(equipeIntegrantes.equipeId, [partida.equipeAId, partida.equipeBId]));
    const duplaA = integrantesDaPartida.filter((i) => i.equipeId === partida.equipeAId).map(({ id, nome, fotoUrl }) => ({ id, nome, fotoUrl }));
    const duplaB = integrantesDaPartida.filter((i) => i.equipeId === partida.equipeBId).map(({ id, nome, fotoUrl }) => ({ id, nome, fotoUrl }));
    const idsA = duplaA.map((a) => a.id);
    const idsB = duplaB.map((a) => a.id);
    const todos = [...idsA, ...idsB];

    const forma: Record<string, ("V" | "D")[]> = Object.fromEntries(todos.map((id) => [id, []]));
    const resultado: ConfrontoPartida = {
      duplaA,
      duplaB,
      duplas: vazio(),
      atletas: idsA.flatMap((a) => idsB.map((b) => ({ atletaA: a, atletaB: b, resultado: vazio() }))),
      juntos: { A: vazio(), B: vazio() },
      forma,
    };
    if (todos.length === 0) return resultado;

    // equipes em que esses atletas jogaram
    const equipesDosAtletas = await db
      .selectDistinct({ equipeId: equipeIntegrantes.equipeId })
      .from(equipeIntegrantes)
      .where(inArray(equipeIntegrantes.usuarioId, todos));
    const equipeIds = equipesDosAtletas.map((e) => e.equipeId);
    if (equipeIds.length === 0) return resultado;

    const linhas = await db
      .select({
        id: partidas.id,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        vencedorId: partidas.vencedorId,
        status: partidas.status,
        fase: partidas.fase,
        detalhesPlacar: partidas.detalhesPlacar,
        finalizadoEm: partidas.finalizadoEm,
        dataHorario: partidas.dataHorario,
        atualizadoEm: partidas.atualizadoEm,
        torneioNome: torneios.nome,
        categoriaNome: categorias.nome,
      })
      .from(partidas)
      .innerJoin(torneios, eq(torneios.id, partidas.torneioId))
      .innerJoin(categorias, eq(categorias.id, partidas.categoriaId))
      .where(
        and(
          or(inArray(partidas.equipeAId, equipeIds), inArray(partidas.equipeBId, equipeIds)),
          inArray(partidas.status, ["FINALIZADA", "WO"]),
          eq(partidas.amistoso, false),
          isNotNull(partidas.vencedorId),
          eq(torneios.oculto, false)
        )
      );

    const equipesDosJogos = Array.from(new Set(linhas.flatMap((l) => [l.equipeAId, l.equipeBId])));
    const membros = equipesDosJogos.length
      ? await db
          .select({ equipeId: equipeIntegrantes.equipeId, usuarioId: equipeIntegrantes.usuarioId })
          .from(equipeIntegrantes)
          .where(inArray(equipeIntegrantes.equipeId, equipesDosJogos))
      : [];
    const porEquipe = new Map<string, string[]>();
    for (const m of membros) porEquipe.set(m.equipeId, [...(porEquipe.get(m.equipeId) ?? []), m.usuarioId]);

    const jogos: JogoHistorico[] = linhas
      .filter((l) => l.id !== partidaId && (l.vencedorId === l.equipeAId || l.vencedorId === l.equipeBId))
      .map((l) => {
        // data do jogo; finalizadoEm pode ser de um lancamento/recalculo posterior
        const data = l.dataHorario ?? l.finalizadoEm ?? l.atualizadoEm;
        return {
          partidaId: l.id,
          torneioNome: l.torneioNome,
          categoriaNome: l.categoriaNome,
          fase: l.fase,
          data: data ? new Date(data).toISOString() : null,
          wo: l.status === "WO",
          ladoA: porEquipe.get(l.equipeAId) ?? [],
          ladoB: porEquipe.get(l.equipeBId) ?? [],
          vencedorLado: (l.vencedorId === l.equipeAId ? "A" : "B") as "A" | "B",
          sets: Array.isArray(l.detalhesPlacar) ? (l.detalhesPlacar as Set[]).map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0 })) : [],
        };
      })
      // mais recente primeiro
      .sort((x, y) => (y.data ?? "").localeCompare(x.data ?? ""));

    for (const j of jogos) {
      // dupla A do jogo consultado enfrentando a dupla B, de qualquer lado
      if (mesmoConjunto(j.ladoA, idsA) && mesmoConjunto(j.ladoB, idsB)) somar(resultado.duplas, j, "A");
      else if (mesmoConjunto(j.ladoB, idsA) && mesmoConjunto(j.ladoA, idsB)) somar(resultado.duplas, j, "B");

      for (const par of resultado.atletas) {
        if (j.ladoA.includes(par.atletaA) && j.ladoB.includes(par.atletaB)) somar(par.resultado, j, "A");
        else if (j.ladoB.includes(par.atletaA) && j.ladoA.includes(par.atletaB)) somar(par.resultado, j, "B");
      }

      if (idsA.length > 1 && idsA.every((id) => j.ladoA.includes(id))) somar(resultado.juntos.A, j, "A");
      else if (idsA.length > 1 && idsA.every((id) => j.ladoB.includes(id))) somar(resultado.juntos.A, j, "B");
      if (idsB.length > 1 && idsB.every((id) => j.ladoA.includes(id))) somar(resultado.juntos.B, j, "A");
      else if (idsB.length > 1 && idsB.every((id) => j.ladoB.includes(id))) somar(resultado.juntos.B, j, "B");

      for (const id of todos) {
        if (forma[id].length >= 5) continue;
        if (j.ladoA.includes(id)) forma[id].push(j.vencedorLado === "A" ? "V" : "D");
        else if (j.ladoB.includes(id)) forma[id].push(j.vencedorLado === "B" ? "V" : "D");
      }
    }

    // a lista detalhada so precisa dos ultimos encontros
    const cortar = (r: ResultadoConfronto) => ({ ...r, jogos: r.jogos.slice(0, 5) });
    return {
      ...resultado,
      duplas: cortar(resultado.duplas),
      atletas: resultado.atletas.map((p) => ({ ...p, resultado: cortar(p.resultado) })),
      juntos: { A: cortar(resultado.juntos.A), B: cortar(resultado.juntos.B) },
    };
  }
}

export const confrontosService = new ConfrontosService();
