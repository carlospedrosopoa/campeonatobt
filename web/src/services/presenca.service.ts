import { db } from "@/db";
import { categorias, inscricoes, partidas, presencas, torneios } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";

export type OrigemPresenca = "QR" | "APP" | "PARCEIRO" | "ARBITRO" | "ADMIN" | "WHATSAPP";

export type ProntidaoPartida = {
  presentes: number;
  total: number;
  faltando: string[];
  chamadoEm: string | null;
};

const TZ = "America/Sao_Paulo";

/** Data (YYYY-MM-DD) no fuso de Brasilia. */
export function dataSP(value: Date | string = new Date()) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function dataValida(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Dia que vale para a presenca de um jogo: o dia do jogo, ou hoje se ainda nao tiver horario. */
function diaDaPartida(dataHorario: Date | string | null | undefined) {
  if (!dataHorario) return dataSP();
  const d = new Date(dataHorario);
  return Number.isNaN(d.getTime()) ? dataSP() : dataSP(d);
}

async function presentesPorDia(torneioId: string, dias: string[]) {
  const unicos = Array.from(new Set(dias));
  const map = new Map<string, Map<string, { origem: string; registradoEm: string }>>();
  if (unicos.length === 0) return map;
  const rows = await db
    .select({ usuarioId: presencas.usuarioId, data: presencas.data, origem: presencas.origem, registradoEm: presencas.registradoEm, status: presencas.status })
    .from(presencas)
    .where(and(eq(presencas.torneioId, torneioId), inArray(presencas.data, unicos)));
  for (const r of rows) {
    if (r.status !== "PRESENTE") continue;
    const dia = String(r.data);
    const m = map.get(dia) ?? new Map();
    m.set(r.usuarioId, { origem: r.origem, registradoEm: new Date(r.registradoEm).toISOString() });
    map.set(dia, m);
  }
  return map;
}

export class PresencaService {
  async registrar(params: {
    torneioId: string;
    usuarioId: string;
    data: string;
    presente: boolean;
    origem: OrigemPresenca;
    registradoPor?: string | null;
  }) {
    if (!params.presente) {
      await db
        .delete(presencas)
        .where(and(eq(presencas.torneioId, params.torneioId), eq(presencas.usuarioId, params.usuarioId), eq(presencas.data, params.data)));
      return { presente: false };
    }
    const agora = new Date();
    await db
      .insert(presencas)
      .values({
        torneioId: params.torneioId,
        usuarioId: params.usuarioId,
        data: params.data,
        status: "PRESENTE",
        origem: params.origem,
        registradoPor: params.registradoPor ?? null,
        registradoEm: agora,
      })
      .onConflictDoUpdate({
        target: [presencas.torneioId, presencas.usuarioId, presencas.data],
        set: { status: "PRESENTE", origem: params.origem, registradoPor: params.registradoPor ?? null, registradoEm: agora },
      });
    return { presente: true, origem: params.origem, registradoEm: agora.toISOString() };
  }

  /** Lista de chamada do dia: atletas das inscricoes aprovadas, agrupados por categoria e dupla. */
  async listaChamada(params: { torneioId: string; data: string; categoriaId?: string | null }) {
    const filtros = [eq(inscricoes.torneioId, params.torneioId), eq(inscricoes.status, "APROVADA")];
    if (params.categoriaId) filtros.push(eq(inscricoes.categoriaId, params.categoriaId));
    const inscritos = await db
      .select({ equipeId: inscricoes.equipeId, categoriaId: inscricoes.categoriaId, categoriaNome: categorias.nome })
      .from(inscricoes)
      .innerJoin(categorias, eq(categorias.id, inscricoes.categoriaId))
      .where(and(...filtros));

    const categoriaIds = Array.from(new Set(inscritos.map((i) => i.categoriaId)));
    const equipeIds = Array.from(new Set(inscritos.map((i) => i.equipeId)));
    const [atletasMap, nomesMap, presentes, jogos] = await Promise.all([
      equipesDisplayService.mapAtletasEquipes(equipeIds, { categoriaId: categoriaIds }),
      equipesDisplayService.mapNomesEquipes(equipeIds, { categoriaId: categoriaIds }),
      presentesPorDia(params.torneioId, [params.data]),
      equipeIds.length
        ? db
            .select({ equipeAId: partidas.equipeAId, equipeBId: partidas.equipeBId, dataHorario: partidas.dataHorario, status: partidas.status })
            .from(partidas)
            .where(eq(partidas.torneioId, params.torneioId))
        : Promise.resolve([] as Array<{ equipeAId: string; equipeBId: string; dataHorario: Date | null; status: string }>),
    ]);
    const presentesDia = presentes.get(params.data) ?? new Map();

    // primeiro jogo de cada dupla no dia (ajuda a ordenar a chamada)
    const primeiroJogo = new Map<string, number>();
    for (const j of jogos) {
      if (!j.dataHorario || j.status === "CANCELADA") continue;
      if (dataSP(j.dataHorario) !== params.data) continue;
      const t = new Date(j.dataHorario).getTime();
      for (const eq_ of [j.equipeAId, j.equipeBId]) {
        const atual = primeiroJogo.get(eq_);
        if (atual === undefined || t < atual) primeiroJogo.set(eq_, t);
      }
    }

    const porCategoria = new Map<string, { id: string; nome: string; duplas: any[] }>();
    const atletasUnicos = new Map<string, boolean>();
    for (const ins of inscritos) {
      const cat = porCategoria.get(ins.categoriaId) ?? { id: ins.categoriaId, nome: ins.categoriaNome, duplas: [] };
      const atletas = (atletasMap.get(ins.equipeId) ?? []).map((a) => {
        const p = presentesDia.get(a.id);
        atletasUnicos.set(a.id, Boolean(p));
        return { usuarioId: a.id, nome: a.nome, fotoUrl: a.fotoUrl, presente: Boolean(p), origem: p?.origem ?? null, registradoEm: p?.registradoEm ?? null };
      });
      const primeiro = primeiroJogo.get(ins.equipeId);
      cat.duplas.push({
        equipeId: ins.equipeId,
        nome: nomesMap.get(ins.equipeId) ?? "Dupla",
        primeiroJogo: primeiro !== undefined ? new Date(primeiro).toISOString() : null,
        atletas,
      });
      porCategoria.set(ins.categoriaId, cat);
    }

    const categoriasLista = Array.from(porCategoria.values())
      .map((c) => ({
        ...c,
        duplas: c.duplas.sort((a, b) => {
          const ta = a.primeiroJogo ? new Date(a.primeiroJogo).getTime() : Number.MAX_SAFE_INTEGER;
          const tb = b.primeiroJogo ? new Date(b.primeiroJogo).getTime() : Number.MAX_SAFE_INTEGER;
          return ta - tb || String(a.nome).localeCompare(String(b.nome), "pt-BR");
        }),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const total = atletasUnicos.size;
    const presentesTotal = Array.from(atletasUnicos.values()).filter(Boolean).length;
    return { data: params.data, resumo: { total, presentes: presentesTotal }, categorias: categoriasLista };
  }

  /** Quantos atletas de cada jogo ja fizeram check-in no dia do jogo. */
  async prontidao(params: { torneioId: string; partidaIds: string[] }): Promise<Record<string, ProntidaoPartida>> {
    const ids = Array.from(new Set(params.partidaIds.filter(Boolean))).slice(0, 500);
    if (ids.length === 0) return {};
    const jogos = await db
      .select({
        id: partidas.id,
        categoriaId: partidas.categoriaId,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        dataHorario: partidas.dataHorario,
        chamadoEm: partidas.chamadoEm,
      })
      .from(partidas)
      .where(and(eq(partidas.torneioId, params.torneioId), inArray(partidas.id, ids)));

    const categoriaIds = Array.from(new Set(jogos.map((j) => j.categoriaId)));
    const equipeIds = Array.from(new Set(jogos.flatMap((j) => [j.equipeAId, j.equipeBId])));
    const [atletasMap, presentes] = await Promise.all([
      equipesDisplayService.mapAtletasEquipes(equipeIds, { categoriaId: categoriaIds }),
      presentesPorDia(params.torneioId, jogos.map((j) => diaDaPartida(j.dataHorario))),
    ]);

    const out: Record<string, ProntidaoPartida> = {};
    for (const j of jogos) {
      const dia = presentes.get(diaDaPartida(j.dataHorario)) ?? new Map();
      const atletas = [...(atletasMap.get(j.equipeAId) ?? []), ...(atletasMap.get(j.equipeBId) ?? [])];
      const faltando = atletas.filter((a) => !dia.has(a.id)).map((a) => a.nome);
      out[j.id] = {
        presentes: atletas.length - faltando.length,
        total: atletas.length,
        faltando,
        chamadoEm: j.chamadoEm ? new Date(j.chamadoEm).toISOString() : null,
      };
    }
    return out;
  }

  /** Detalhe para a conferencia na quadra (arbitro). */
  async detalhePartida(params: { torneioId: string; partidaId: string }) {
    const [jogo] = await db
      .select({
        id: partidas.id,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        status: partidas.status,
        quadra: partidas.quadra,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        dataHorario: partidas.dataHorario,
        chamadoEm: partidas.chamadoEm,
        toleranciaMin: torneios.toleranciaAtrasoMin,
      })
      .from(partidas)
      .innerJoin(categorias, eq(categorias.id, partidas.categoriaId))
      .innerJoin(torneios, eq(torneios.id, partidas.torneioId))
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.id, params.partidaId)))
      .limit(1);
    if (!jogo) return null;

    const dia = diaDaPartida(jogo.dataHorario);
    const [atletasMap, presentes] = await Promise.all([
      equipesDisplayService.mapAtletasEquipes([jogo.equipeAId, jogo.equipeBId], { categoriaId: jogo.categoriaId }),
      presentesPorDia(params.torneioId, [dia]),
    ]);
    const presentesDia = presentes.get(dia) ?? new Map();
    const lado = (equipeId: string, l: "A" | "B") =>
      (atletasMap.get(equipeId) ?? []).map((a) => {
        const p = presentesDia.get(a.id);
        return { usuarioId: a.id, nome: a.nome, fotoUrl: a.fotoUrl, lado: l, presente: Boolean(p), origem: p?.origem ?? null };
      });

    return {
      partidaId: jogo.id,
      categoriaNome: jogo.categoriaNome,
      status: jogo.status,
      quadra: jogo.quadra,
      dataHorario: jogo.dataHorario ? new Date(jogo.dataHorario).toISOString() : null,
      chamadoEm: jogo.chamadoEm ? new Date(jogo.chamadoEm).toISOString() : null,
      toleranciaMin: jogo.toleranciaMin ?? 15,
      data: dia,
      atletas: [...lado(jogo.equipeAId, "A"), ...lado(jogo.equipeBId, "B")],
    };
  }

  /** Marca (ou desfaz) a chamada do jogo para a quadra; a tolerancia conta a partir daqui. */
  async definirChamada(params: { torneioId: string; partidaId: string; chamar: boolean }) {
    const [updated] = await db
      .update(partidas)
      .set({ chamadoEm: params.chamar ? new Date() : null, atualizadoEm: new Date() })
      .where(and(eq(partidas.torneioId, params.torneioId), eq(partidas.id, params.partidaId)))
      .returning({ id: partidas.id, chamadoEm: partidas.chamadoEm });
    return updated ?? null;
  }
}

export const presencaService = new PresencaService();
