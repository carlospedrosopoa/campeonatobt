import { db } from "@/db";
import { categorias, equipeIntegrantes, inscricaoPagamentos, inscricoes, partidas, presencas, torneios } from "@/db/schema";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { dataSP, presencaService } from "@/services/presenca.service";
import { validarTokenCheckin } from "@/lib/checkin-qr";

/** Janela do botao "Cheguei": de 2h antes do 1o jogo do dia ate 2h depois do horario do ultimo. */
const ANTES_MS = 2 * 60 * 60 * 1000;
const DEPOIS_MS = 2 * 60 * 60 * 1000;

export class CheckinError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type TorneioCheckin = { id: string; nome: string; slug: string; checkinModo: string };

async function equipesDoAtleta(usuarioId: string) {
  const [porIntegrante, porPagamento] = await Promise.all([
    db.select({ equipeId: equipeIntegrantes.equipeId }).from(equipeIntegrantes).where(eq(equipeIntegrantes.usuarioId, usuarioId)),
    db
      .select({ equipeId: inscricoes.equipeId })
      .from(inscricaoPagamentos)
      .innerJoin(inscricoes, eq(inscricoes.id, inscricaoPagamentos.inscricaoId))
      .where(eq(inscricaoPagamentos.usuarioId, usuarioId)),
  ]);
  return Array.from(new Set([...porIntegrante, ...porPagamento].map((r) => r.equipeId)));
}

/** Inscricoes aprovadas do atleta no torneio (equipe + categoria). */
async function inscricoesAprovadas(usuarioId: string, torneioId: string) {
  const equipeIds = await equipesDoAtleta(usuarioId);
  if (equipeIds.length === 0) return [];
  return db
    .select({ equipeId: inscricoes.equipeId, categoriaId: inscricoes.categoriaId })
    .from(inscricoes)
    .where(and(eq(inscricoes.torneioId, torneioId), eq(inscricoes.status, "APROVADA"), inArray(inscricoes.equipeId, equipeIds)));
}

/** Parceiros do atleta no torneio, com a presenca do dia. */
async function parceirosNoTorneio(usuarioId: string, torneioId: string, data: string) {
  const insc = await inscricoesAprovadas(usuarioId, torneioId);
  if (insc.length === 0) return [];
  const atletasMap = await equipesDisplayService.mapAtletasEquipes(
    insc.map((i) => i.equipeId),
    { categoriaId: insc.map((i) => i.categoriaId) },
  );
  const parceiros = new Map<string, { usuarioId: string; nome: string; fotoUrl: string | null }>();
  for (const lista of atletasMap.values()) {
    if (!lista.some((a) => a.id === usuarioId)) continue;
    for (const a of lista) if (a.id !== usuarioId) parceiros.set(a.id, { usuarioId: a.id, nome: a.nome, fotoUrl: a.fotoUrl });
  }
  const ids = Array.from(parceiros.keys());
  const presentes = ids.length
    ? await db
        .select({ usuarioId: presencas.usuarioId })
        .from(presencas)
        .where(and(eq(presencas.torneioId, torneioId), eq(presencas.data, data), inArray(presencas.usuarioId, ids), eq(presencas.status, "PRESENTE")))
    : [];
  const setPresentes = new Set(presentes.map((p) => p.usuarioId));
  return Array.from(parceiros.values()).map((p) => ({ ...p, presente: setPresentes.has(p.usuarioId) }));
}

async function presencaDoAtleta(usuarioId: string, torneioId: string, data: string) {
  const [p] = await db
    .select({ origem: presencas.origem, registradoEm: presencas.registradoEm, status: presencas.status })
    .from(presencas)
    .where(and(eq(presencas.torneioId, torneioId), eq(presencas.usuarioId, usuarioId), eq(presencas.data, data)))
    .limit(1);
  return p && p.status === "PRESENTE" ? { origem: p.origem, registradoEm: new Date(p.registradoEm).toISOString() } : null;
}

export class PresencaAtletaService {
  /** Torneios em que o atleta joga hoje, com janela de check-in, presenca e parceiros. */
  async status(usuarioId: string, agora = new Date()) {
    const hoje = dataSP(agora);
    const equipeIds = await equipesDoAtleta(usuarioId);
    if (equipeIds.length === 0) return { data: hoje, torneios: [] };

    const jogos = await db
      .select({
        id: partidas.id,
        torneioId: partidas.torneioId,
        torneioNome: torneios.nome,
        torneioSlug: torneios.slug,
        checkinModo: torneios.checkinModo,
        categoriaNome: categorias.nome,
        dataHorario: partidas.dataHorario,
        quadra: partidas.quadra,
        status: partidas.status,
      })
      .from(partidas)
      .innerJoin(torneios, eq(torneios.id, partidas.torneioId))
      .innerJoin(categorias, eq(categorias.id, partidas.categoriaId))
      .where(and(or(inArray(partidas.equipeAId, equipeIds), inArray(partidas.equipeBId, equipeIds)), ne(partidas.status, "CANCELADA")));

    const doDia = jogos.filter((j) => j.dataHorario && dataSP(j.dataHorario) === hoje);
    const porTorneio = new Map<string, typeof doDia>();
    for (const j of doDia) porTorneio.set(j.torneioId, [...(porTorneio.get(j.torneioId) ?? []), j]);

    const resultado = [];
    for (const [torneioId, lista] of porTorneio) {
      const ordenados = lista.slice().sort((a, b) => new Date(a.dataHorario!).getTime() - new Date(b.dataHorario!).getTime());
      const primeiro = new Date(ordenados[0].dataHorario!).getTime();
      const ultimo = new Date(ordenados[ordenados.length - 1].dataHorario!).getTime();
      const abre = new Date(primeiro - ANTES_MS);
      const fecha = new Date(ultimo + DEPOIS_MS);
      const proximo = ordenados.find((j) => j.status === "AGENDADA" || j.status === "EM_ANDAMENTO") ?? null;
      const [presenca, parceiros] = await Promise.all([
        presencaDoAtleta(usuarioId, torneioId, hoje),
        parceirosNoTorneio(usuarioId, torneioId, hoje),
      ]);
      const modo = lista[0].checkinModo;
      resultado.push({
        torneio: { id: torneioId, nome: lista[0].torneioNome, slug: lista[0].torneioSlug, checkinModo: modo },
        presente: Boolean(presenca),
        presenca,
        janela: { abre: abre.toISOString(), fecha: fecha.toISOString(), aberta: agora >= abre && agora <= fecha },
        botaoPermitido: modo !== "QR",
        qrPermitido: modo !== "BOTAO",
        proximoJogo: proximo
          ? { id: proximo.id, dataHorario: new Date(proximo.dataHorario!).toISOString(), categoriaNome: proximo.categoriaNome, quadra: proximo.quadra }
          : null,
        jogosHoje: ordenados.length,
        parceiros,
      });
    }
    return { data: hoje, torneios: resultado };
  }

  /** Check-in do proprio atleta, pelo botao do app ou pelo QR da entrada. */
  async checkin(params: { usuarioId: string; torneioId?: string | null; torneioSlug?: string | null; origem: "APP" | "QR"; token?: string | null }) {
    const agora = new Date();
    const hoje = dataSP(agora);
    const torneio = await this.buscarTorneio(params.torneioId, params.torneioSlug);

    if (params.origem === "QR") {
      if (torneio.checkinModo === "BOTAO") throw new CheckinError("Este torneio usa o check-in pelo botão do app.");
      if (!params.token || !validarTokenCheckin(torneio.id, hoje, params.token)) {
        throw new CheckinError("QR inválido ou de outro dia. Leia o QR que está na mesa da organização hoje.");
      }
      const insc = await inscricoesAprovadas(params.usuarioId, torneio.id);
      if (insc.length === 0) throw new CheckinError("Não encontramos inscrição aprovada sua neste torneio.", 403);
    } else {
      if (torneio.checkinModo === "QR") throw new CheckinError("Neste torneio o check-in é feito pelo QR na mesa da organização.");
      const st = (await this.status(params.usuarioId, agora)).torneios.find((t) => t.torneio.id === torneio.id);
      if (!st) throw new CheckinError("Você não tem jogo neste torneio hoje.");
      if (!st.janela.aberta) {
        const abre = new Date(st.janela.abre).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
        throw new CheckinError(agora < new Date(st.janela.abre) ? `O check-in abre às ${abre}.` : "O check-in de hoje já foi encerrado.");
      }
    }

    // mantem o primeiro registro do dia (hora e origem de quando chegou)
    const existente = await presencaDoAtleta(params.usuarioId, torneio.id, hoje);
    if (!existente) {
      await presencaService.registrar({
        torneioId: torneio.id,
        usuarioId: params.usuarioId,
        data: hoje,
        presente: true,
        origem: params.origem,
        registradoPor: params.usuarioId,
      });
    }
    const presenca = existente ?? (await presencaDoAtleta(params.usuarioId, torneio.id, hoje));
    const parceiros = await parceirosNoTorneio(params.usuarioId, torneio.id, hoje);
    return { torneio, data: hoje, presente: true, jaEstavaPresente: Boolean(existente), presenca, parceiros };
  }

  /** O atleta (ja presente) informa que o parceiro tambem chegou. */
  async confirmarParceiro(params: { usuarioId: string; torneioId: string; parceiroId: string }) {
    const hoje = dataSP();
    const torneio = await this.buscarTorneio(params.torneioId, null);
    if (!(await presencaDoAtleta(params.usuarioId, torneio.id, hoje))) {
      throw new CheckinError("Faça o seu check-in antes de confirmar o parceiro.");
    }
    const parceiros = await parceirosNoTorneio(params.usuarioId, torneio.id, hoje);
    const parceiro = parceiros.find((p) => p.usuarioId === params.parceiroId);
    if (!parceiro) throw new CheckinError("Este atleta não é seu parceiro neste torneio.", 403);
    if (!parceiro.presente) {
      await presencaService.registrar({
        torneioId: torneio.id,
        usuarioId: parceiro.usuarioId,
        data: hoje,
        presente: true,
        origem: "PARCEIRO",
        registradoPor: params.usuarioId,
      });
    }
    return { parceiros: await parceirosNoTorneio(params.usuarioId, torneio.id, hoje) };
  }

  private async buscarTorneio(torneioId?: string | null, slug?: string | null): Promise<TorneioCheckin> {
    if (!torneioId && !slug) throw new CheckinError("Torneio não informado.");
    const [t] = await db
      .select({ id: torneios.id, nome: torneios.nome, slug: torneios.slug, checkinModo: torneios.checkinModo })
      .from(torneios)
      .where(torneioId ? eq(torneios.id, torneioId) : eq(torneios.slug, String(slug)))
      .limit(1);
    if (!t) throw new CheckinError("Torneio não encontrado.", 404);
    return t;
  }
}

export const presencaAtletaService = new PresencaAtletaService();
