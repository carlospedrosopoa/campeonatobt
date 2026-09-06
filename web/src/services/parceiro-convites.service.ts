import { db } from "@/db";
import { categorias, parceiroConvitesWhatsapp, torneios, usuarios } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAppAtletaUrl } from "@/lib/app-atleta-url";

export type ConviteWhatsappStatus =
  | "PENDENTE"
  | "ENVIADO"
  | "FALHA"
  | "SEM_GZAPPY"
  | "SEM_WHATSAPP"
  | "CANCELADO";

export type ConviteWhatsappAviso = "WHATSAPP_JA_CADASTRADO" | null;

export type MontarMensagemInput = {
  parceiroNome: string;
  atletaConvidanteNome: string;
  torneioNome: string;
  categoriaNome: string;
  linkCriarPerfil: string;
};

export type ConviteTableRow = {
  id: string;
  torneioId: string;
  categoriaId: string;
  atletaConvidanteId: string;
  parceiroNome: string;
  parceiroWhatsappNormalizado: string;
  parceiroWhatsappBruto: string;
  whatsappStatus: ConviteWhatsappStatus;
  mensagemEnviadaText: string | null;
  linkCriarPerfilUsado: string | null;
  reenvioCount: number;
  criadoEm: Date;
  ultimoReenvioEm: Date | null;
};

export type GetOrCreateConviteResult = {
  row: ConviteTableRow;
  isFresh: boolean;
  podeReenviar: boolean;
  esperaSegundos: number;
  statusRateLimit: "OK" | "BLOQUEADO_JANELA_3REENVIO_1H" | "IDEMPOTENTE_60S";
};

export type RegistrarEnvioGzappyInput = {
  row: ConviteTableRow;
  mensagemFinal: string;
  linkCriarPerfilUsado: string;
  result:
    | { ok: true; skipped: false; data?: unknown; status?: number }
    | { ok: false; skipped: true }
    | { ok: false; skipped: false; status: number; data?: unknown; erro?: string };
};

const SEGUNDOS_IDEMPOTENCIA_REPETIDO = 60;
const MIN_SEGUNDOS_ENTRE_REENVIOS = 30;
const MAX_REENVIOS_POR_HORA = 3;
const JANELA_HORA_SEGUNDOS = 3600;

export function normalizePhone(text: string): string {
  return String(text || "").replace(/\D/g, "");
}

export function maskWhatsapp(telefoneNormalizado?: string | null): string {
  const digits = normalizePhone(String(telefoneNormalizado || ""));
  if (!digits) return "—";
  let br = digits;
  if (br.startsWith("55") && br.length >= 12) {
    br = br.slice(2);
  }
  if (br.length === 11) {
    const ddd = br.slice(0, 2);
    const parte1 = br.slice(2, 3);
    const parte2 = br.slice(7, 11);
    return `${ddd} ${parte1}****-${parte2}`;
  }
  if (br.length === 10) {
    const ddd = br.slice(0, 2);
    const parte1 = br.slice(2, 3);
    const parte2 = br.slice(6, 10);
    return `${ddd} ${parte1}****-${parte2}`;
  }
  if (br.length >= 8) {
    const last4 = br.slice(br.length - 4);
    const firstChunk = br.slice(0, Math.max(2, Math.min(3, br.length - 6)));
    return `${firstChunk} ****-${last4}`;
  }
  return "****".padEnd(Math.max(5, digits.length), "*");
}

export function validateNomeCompleto(input: string): string {
  const cleaned = String(input || "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) throw new Error("Nome do parceiro é obrigatório.");
  if (cleaned.length < 4) throw new Error("Nome do parceiro muito curto.");
  if (cleaned.length > 255) throw new Error("Nome do parceiro muito longo.");
  const palavras = cleaned.split(" ").filter((w) => w.length >= 2);
  if (palavras.length < 2) throw new Error("Informe nome e sobrenome do parceiro (pelo menos 2 nomes).");
  return cleaned;
}

export function montarMensagemConvite(input: MontarMensagemInput): string {
  const primeiroNomeAtleta = (input.atletaConvidanteNome || "").trim().split(/\s+/)[0] || input.atletaConvidanteNome;
  const linhas = [
    `Olá ${input.parceiroNome}, tudo bem? 👋`,
    "",
    `${input.atletaConvidanteNome} tem interesse em se inscrever no torneio ${input.torneioNome} na categoria ${input.categoriaNome} com você como parceiro(a).`,
    "",
    "Para participar, crie seu perfil no Play Na Quadra Atleta pelo link abaixo:",
    input.linkCriarPerfil,
    "",
    `Após criar o perfil, avise ${primeiroNomeAtleta} para ele(a) finalizar a inscrição.`,
    "",
    "— Play Na Quadra",
  ];
  return linhas.join("\n");
}

export function buildLinkCriarPerfil(conviteId: string): string {
  const base = getAppAtletaUrl();
  const url = new URL(`${base}/criar-conta`);
  url.searchParams.set("utm_source", "gzappy");
  url.searchParams.set("utm_campaign", "convite_parceiro");
  url.searchParams.set("ref", `convite_${conviteId}`);
  return url.toString();
}

export async function categoriaEhDuplas(categoriaId: string): Promise<{
  tipoParticipacao: "SIMPLES" | "DUPLAS";
  torneioId: string;
  categoriaNome: string;
  torneioNome: string;
  torneioStatus: string;
}> {
  const rows = await db
    .select({
      categoriaNome: categorias.nome,
      torneioId: categorias.torneioId,
      torneioNome: torneios.nome,
      torneioStatus: torneios.status,
    })
    .from(categorias)
    .innerJoin(torneios, eq(torneios.id, categorias.torneioId))
    .where(eq(categorias.id, categoriaId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error("Categoria não encontrada"), { code: "CATEGORIA_NOT_FOUND", statusCode: 404 });
  }
  const { categoriaConfigService } = await import("@/services/categoria-config.service");
  const cfg = await categoriaConfigService.obterOuDefault(categoriaId);
  const tipoParticipacao = cfg.tipoParticipacao === "SIMPLES" ? "SIMPLES" : "DUPLAS";
  return {
    tipoParticipacao,
    torneioId: row.torneioId,
    categoriaNome: row.categoriaNome,
    torneioNome: row.torneioNome,
    torneioStatus: String(row.torneioStatus || ""),
  };
}

export type UsuarioParceiroCadastrado = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  fotoUrl: string | null;
  playnaquadraAtletaId: string | null;
  whatsappNormalizado: string;
};

export async function whatsappJaCadastrado(bruto: string): Promise<UsuarioParceiroCadastrado | null> {
  const normalized = normalizePhone(bruto);
  if (!normalized) return null;
  const variants = new Set<string>([normalized]);
  if (normalized.startsWith("55") && normalized.length >= 12) variants.add(normalized.slice(2));
  if (normalized.length <= 11 && !normalized.startsWith("55")) variants.add(`55${normalized}`);
  const list = Array.from(variants);
  const rows = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      telefone: usuarios.telefone,
      fotoUrl: usuarios.fotoUrl,
      playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
    })
    .from(usuarios)
    .where(sql`regexp_replace(coalesce(${usuarios.telefone}, ''), '\\D', '', 'g') in ${sql.raw(`(${list.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")})`)}`)
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    nome: String(r.nome || ""),
    email: String(r.email || ""),
    telefone: r.telefone ? String(r.telefone) : null,
    fotoUrl: r.fotoUrl ? String(r.fotoUrl) : null,
    playnaquadraAtletaId: r.playnaquadraAtletaId ? String(r.playnaquadraAtletaId) : null,
    whatsappNormalizado: normalized,
  };
}

function rowToTable(r: any): ConviteTableRow {
  return {
    id: String(r.id),
    torneioId: String(r.torneioId),
    categoriaId: String(r.categoriaId),
    atletaConvidanteId: String(r.atletaConvidanteId),
    parceiroNome: String(r.parceiroNome),
    parceiroWhatsappNormalizado: String(r.parceiroWhatsappNormalizado),
    parceiroWhatsappBruto: String(r.parceiroWhatsappBruto),
    whatsappStatus: String(r.whatsappStatus || "PENDENTE") as ConviteWhatsappStatus,
    mensagemEnviadaText: r.mensagemEnviadaText ? String(r.mensagemEnviadaText) : null,
    linkCriarPerfilUsado: r.linkCriarPerfilUsado ? String(r.linkCriarPerfilUsado) : null,
    reenvioCount: Number(r.reenvioCount || 0),
    criadoEm: r.criadoEm instanceof Date ? r.criadoEm : new Date(String(r.criadoEm)),
    ultimoReenvioEm: r.ultimoReenvioEm ? (r.ultimoReenvioEm instanceof Date ? r.ultimoReenvioEm : new Date(String(r.ultimoReenvioEm))) : null,
  };
}

export async function getOrCreateConviteParaReenvio(params: {
  atletaId: string;
  categoriaId: string;
  torneioId: string;
  parceiroNome: string;
  parceiroWhatsappBruto: string;
  parceiroWhatsappNormalizado: string;
}): Promise<GetOrCreateConviteResult> {
  if (!params.parceiroWhatsappNormalizado) {
    throw Object.assign(new Error("WhatsApp inválido após normalização"), { code: "WHATSAPP_INVALIDO" });
  }
  const agora = new Date();
  const t60Atras = new Date(agora.getTime() - SEGUNDOS_IDEMPOTENCIA_REPETIDO * 1000);
  const tHoraAtras = new Date(agora.getTime() - JANELA_HORA_SEGUNDOS * 1000);
  const tMinAtras = new Date(agora.getTime() - MIN_SEGUNDOS_ENTRE_REENVIOS * 1000);

  const recentes = await db
    .select({
      id: parceiroConvitesWhatsapp.id,
      torneioId: parceiroConvitesWhatsapp.torneioId,
      categoriaId: parceiroConvitesWhatsapp.categoriaId,
      atletaConvidanteId: parceiroConvitesWhatsapp.atletaConvidanteId,
      parceiroNome: parceiroConvitesWhatsapp.parceiroNome,
      parceiroWhatsappNormalizado: parceiroConvitesWhatsapp.parceiroWhatsappNormalizado,
      parceiroWhatsappBruto: parceiroConvitesWhatsapp.parceiroWhatsappBruto,
      whatsappStatus: parceiroConvitesWhatsapp.whatsappStatus,
      mensagemEnviadaText: parceiroConvitesWhatsapp.mensagemEnviadaText,
      linkCriarPerfilUsado: parceiroConvitesWhatsapp.linkCriarPerfilUsado,
      reenvioCount: parceiroConvitesWhatsapp.reenvioCount,
      criadoEm: parceiroConvitesWhatsapp.criadoEm,
      ultimoReenvioEm: parceiroConvitesWhatsapp.ultimoReenvioEm,
    })
    .from(parceiroConvitesWhatsapp)
    .where(
      and(
        eq(parceiroConvitesWhatsapp.atletaConvidanteId, params.atletaId as any),
        eq(parceiroConvitesWhatsapp.categoriaId, params.categoriaId as any),
        eq(parceiroConvitesWhatsapp.parceiroWhatsappNormalizado, params.parceiroWhatsappNormalizado)
      )
    )
    .orderBy(desc(parceiroConvitesWhatsapp.criadoEm))
    .limit(20);

  const ordered = recentes.map(rowToTable);
  if (ordered.length > 0) {
    const ultimo = ordered[0];
    const criadoEmTs = ultimo.criadoEm.getTime();
    if (criadoEmTs >= t60Atras.getTime()) {
      return {
        row: ultimo,
        isFresh: false,
        podeReenviar: false,
        esperaSegundos: Math.max(0, Math.ceil((criadoEmTs + SEGUNDOS_IDEMPOTENCIA_REPETIDO * 1000 - agora.getTime()) / 1000)),
        statusRateLimit: "IDEMPOTENTE_60S",
      };
    }
  }

  const enviadosUltimaHora = ordered.filter((r) => {
    const ref = r.ultimoReenvioEm ? r.ultimoReenvioEm : r.criadoEm;
    return ref.getTime() >= tHoraAtras.getTime();
  });
  const qtdeJanela = enviadosUltimaHora.reduce((acc, r) => acc + 1 + Number(r.reenvioCount || 0), 0);
  if (qtdeJanela > MAX_REENVIOS_POR_HORA) {
    const maisAntigo = enviadosUltimaHora[enviadosUltimaHora.length - 1];
    const ref = maisAntigo.ultimoReenvioEm || maisAntigo.criadoEm;
    const esperaMs = ref.getTime() + JANELA_HORA_SEGUNDOS * 1000 - agora.getTime();
    return {
      row: ordered[0] ?? (await criarNovoRegistro(params)),
      isFresh: false,
      podeReenviar: false,
      esperaSegundos: Math.max(0, Math.ceil(esperaMs / 1000)),
      statusRateLimit: "BLOQUEADO_JANELA_3REENVIO_1H",
    };
  }

  if (ordered.length > 0) {
    const ultimo = ordered[0];
    const refUltimo = ultimo.ultimoReenvioEm || ultimo.criadoEm;
    if (refUltimo.getTime() > tMinAtras.getTime()) {
      return {
        row: ultimo,
        isFresh: false,
        podeReenviar: false,
        esperaSegundos: Math.max(0, Math.ceil((refUltimo.getTime() + MIN_SEGUNDOS_ENTRE_REENVIOS * 1000 - agora.getTime()) / 1000)),
        statusRateLimit: "IDEMPOTENTE_60S",
      };
    }
  }

  const row = ordered.length > 0 ? ordered[0] : await criarNovoRegistro(params);
  return {
    row,
    isFresh: ordered.length === 0,
    podeReenviar: true,
    esperaSegundos: 0,
    statusRateLimit: "OK",
  };
}

async function criarNovoRegistro(params: {
  atletaId: string;
  categoriaId: string;
  torneioId: string;
  parceiroNome: string;
  parceiroWhatsappBruto: string;
  parceiroWhatsappNormalizado: string;
}): Promise<ConviteTableRow> {
  const inserted = await db
    .insert(parceiroConvitesWhatsapp)
    .values({
      torneioId: params.torneioId,
      categoriaId: params.categoriaId,
      atletaConvidanteId: params.atletaId,
      parceiroNome: params.parceiroNome,
      parceiroWhatsappBruto: params.parceiroWhatsappBruto,
      parceiroWhatsappNormalizado: params.parceiroWhatsappNormalizado,
      whatsappStatus: "PENDENTE",
      reenvioCount: 0,
    })
    .returning({
      id: parceiroConvitesWhatsapp.id,
      torneioId: parceiroConvitesWhatsapp.torneioId,
      categoriaId: parceiroConvitesWhatsapp.categoriaId,
      atletaConvidanteId: parceiroConvitesWhatsapp.atletaConvidanteId,
      parceiroNome: parceiroConvitesWhatsapp.parceiroNome,
      parceiroWhatsappNormalizado: parceiroConvitesWhatsapp.parceiroWhatsappNormalizado,
      parceiroWhatsappBruto: parceiroConvitesWhatsapp.parceiroWhatsappBruto,
      whatsappStatus: parceiroConvitesWhatsapp.whatsappStatus,
      mensagemEnviadaText: parceiroConvitesWhatsapp.mensagemEnviadaText,
      linkCriarPerfilUsado: parceiroConvitesWhatsapp.linkCriarPerfilUsado,
      reenvioCount: parceiroConvitesWhatsapp.reenvioCount,
      criadoEm: parceiroConvitesWhatsapp.criadoEm,
      ultimoReenvioEm: parceiroConvitesWhatsapp.ultimoReenvioEm,
    });
  return rowToTable(inserted[0]);
}

export async function registrarEnvioGzappy(params: RegistrarEnvioGzappyInput): Promise<ConviteTableRow> {
  const r = params.result;
  let status: ConviteWhatsappStatus = params.row.whatsappStatus;
  let erro: string | null = null;
  let gzappyResponse: unknown = null;
  let enviadoEm: Date | null = null;

  if (r.ok && !r.skipped) {
    status = "ENVIADO";
    enviadoEm = new Date();
    gzappyResponse = (r as any).data ?? null;
  } else if (!r.ok && r.skipped) {
    status = "SEM_GZAPPY";
  } else if (!r.ok && !r.skipped) {
    status = "FALHA";
    erro = (r as any).erro || `Gzappy respondeu status ${r.status ?? "?"}`;
    gzappyResponse = (r as any).data ?? null;
  }

  const updatedRows = await db
    .update(parceiroConvitesWhatsapp)
    .set({
      mensagemEnviadaText: params.mensagemFinal,
      linkCriarPerfilUsado: params.linkCriarPerfilUsado,
      whatsappStatus: status,
      whatsappEnviadoEm: enviadoEm,
      whatsappErro: erro,
      gzappyResponseJsonb: gzappyResponse as any,
      reenvioCount: sql`CASE WHEN ${parceiroConvitesWhatsapp.criadoEm} = ${parceiroConvitesWhatsapp.atualizadoEm} THEN 0 ELSE coalesce(${parceiroConvitesWhatsapp.reenvioCount}, 0) + 1 END`,
      ultimoReenvioEm: new Date(),
    })
    .where(eq(parceiroConvitesWhatsapp.id, params.row.id as any))
    .returning({
      id: parceiroConvitesWhatsapp.id,
      torneioId: parceiroConvitesWhatsapp.torneioId,
      categoriaId: parceiroConvitesWhatsapp.categoriaId,
      atletaConvidanteId: parceiroConvitesWhatsapp.atletaConvidanteId,
      parceiroNome: parceiroConvitesWhatsapp.parceiroNome,
      parceiroWhatsappNormalizado: parceiroConvitesWhatsapp.parceiroWhatsappNormalizado,
      parceiroWhatsappBruto: parceiroConvitesWhatsapp.parceiroWhatsappBruto,
      whatsappStatus: parceiroConvitesWhatsapp.whatsappStatus,
      mensagemEnviadaText: parceiroConvitesWhatsapp.mensagemEnviadaText,
      linkCriarPerfilUsado: parceiroConvitesWhatsapp.linkCriarPerfilUsado,
      reenvioCount: parceiroConvitesWhatsapp.reenvioCount,
      criadoEm: parceiroConvitesWhatsapp.criadoEm,
      ultimoReenvioEm: parceiroConvitesWhatsapp.ultimoReenvioEm,
    });
  return rowToTable(updatedRows[0]);
}

export async function primeiroNome(nome?: string | null): Promise<string> {
  const cleaned = String(nome || "").trim();
  if (!cleaned) return "";
  return cleaned.split(/\s+/)[0];
}
