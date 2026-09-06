import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatarNumeroGzappy, enviarMensagemGzappy } from "@/services/gzappy.service";
import {
  buildLinkCriarPerfil,
  categoriaEhDuplas,
  getOrCreateConviteParaReenvio,
  maskWhatsapp,
  montarMensagemConvite,
  normalizePhone,
  registrarEnvioGzappy,
  validateNomeCompleto,
  whatsappJaCadastrado,
  type ConviteWhatsappStatus,
  type ConviteWhatsappAviso,
} from "@/services/parceiro-convites.service";

type PostBody = {
  categoriaId?: string;
  parceiroNome?: string;
  parceiroWhatsapp?: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.perfil !== "ATLETA") {
    return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
  }

  let body: PostBody | null = null;
  try {
    body = (await request.json().catch(() => null)) as PostBody | null;
  } catch {
    body = null;
  }

  const categoriaId = String(body?.categoriaId || "").trim();
  const parceiroNomeRaw = String(body?.parceiroNome || "").trim();
  const parceiroWhatsappBruto = String(body?.parceiroWhatsapp || "").trim();

  if (!categoriaId) return NextResponse.json({ error: "categoriaId é obrigatório" }, { status: 400 });
  if (!parceiroNomeRaw) return NextResponse.json({ error: "Informe o nome do parceiro.", field: "parceiroNome" }, { status: 400 });
  if (!parceiroWhatsappBruto) return NextResponse.json({ error: "Informe o WhatsApp do parceiro.", field: "parceiroWhatsapp" }, { status: 400 });

  let parceiroNomeValidado: string;
  try {
    parceiroNomeValidado = validateNomeCompleto(parceiroNomeRaw);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "Nome inválido."), field: "parceiroNome" }, { status: 400 });
  }

  const digits = normalizePhone(parceiroWhatsappBruto);
  if (digits.length < 10 || digits.length > 20) {
    return NextResponse.json(
      { error: "WhatsApp inválido. Informe DDD + número (ex: 51 99999-1234).", field: "parceiroWhatsapp" },
      { status: 400 }
    );
  }
  const whatsappNormalizado = formatarNumeroGzappy(parceiroWhatsappBruto);
  if (!whatsappNormalizado) {
    return NextResponse.json(
      { error: "Não foi possível normalizar este WhatsApp. Tente novamente.", field: "parceiroWhatsapp" },
      { status: 400 }
    );
  }

  let meta;
  try {
    meta = await categoriaEhDuplas(categoriaId);
  } catch (e: any) {
    const status = Number(e?.statusCode) || 400;
    if (status === 404) return NextResponse.json({ error: e?.message || "Categoria não encontrada" }, { status: 404 });
    return NextResponse.json({ error: e?.message || "Erro ao validar categoria." }, { status });
  }

  if (meta.tipoParticipacao !== "DUPLAS") {
    return NextResponse.json({ error: "Este recurso só está disponível para categorias de duplas." }, { status: 400 });
  }
  if (meta.torneioStatus !== "ABERTO") {
    return NextResponse.json({ error: "Inscrições não estão abertas para este torneio." }, { status: 400 });
  }

  const rowsAtleta = await db
    .select({ id: usuarios.id, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, auth.user.id))
    .limit(1);
  const atleta = rowsAtleta[0];
  if (!atleta) return NextResponse.json({ error: "Atleta não encontrado." }, { status: 404 });

  const aviso: ConviteWhatsappAviso = (await whatsappJaCadastrado(parceiroWhatsappBruto)) ? "WHATSAPP_JA_CADASTRADO" : null;

  let createdOrReused;
  try {
    createdOrReused = await getOrCreateConviteParaReenvio({
      atletaId: String(auth.user.id),
      categoriaId,
      torneioId: meta.torneioId,
      parceiroNome: parceiroNomeValidado,
      parceiroWhatsappBruto,
      parceiroWhatsappNormalizado: whatsappNormalizado,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao preparar convite." }, { status: 400 });
  }

  if (createdOrReused.statusRateLimit === "BLOQUEADO_JANELA_3REENVIO_1H") {
    return NextResponse.json(
      {
        error:
          "Você já convidou esta pessoa recentemente para esta categoria. " +
          "Aguarde 1 hora antes de reenviar, ou copie o link manual abaixo e envie você mesmo.",
        conviteId: createdOrReused.row.id,
        status: createdOrReused.row.whatsappStatus,
        linkCriarPerfil: createdOrReused.row.linkCriarPerfilUsado || buildLinkCriarPerfil(createdOrReused.row.id),
        whatsappMascarado: maskWhatsapp(createdOrReused.row.parceiroWhatsappNormalizado),
        esperaSegundos: createdOrReused.esperaSegundos,
      },
      { status: 429 }
    );
  }

  const row = createdOrReused.row;
  const linkCriarPerfil = row.linkCriarPerfilUsado || buildLinkCriarPerfil(row.id);
  const mensagemFinal = montarMensagemConvite({
    parceiroNome: parceiroNomeValidado,
    atletaConvidanteNome: atleta.nome || "Um(a) atleta",
    torneioNome: meta.torneioNome,
    categoriaNome: meta.categoriaNome,
    linkCriarPerfil,
  });

  let gzappyResult:
    | { ok: true; skipped: false; data?: unknown; status?: number }
    | { ok: false; skipped: true }
    | { ok: false; skipped: false; status: number; data?: unknown; erro?: string } = { ok: false, skipped: true };
  let statusResposta: ConviteWhatsappStatus = row.whatsappStatus;

  if (createdOrReused.podeReenviar) {
    try {
      const r = await enviarMensagemGzappy({
        destinatario: whatsappNormalizado,
        mensagem: mensagemFinal,
      });
      if (r.ok && !r.skipped) {
        gzappyResult = { ok: true, skipped: false, data: r.data, status: 200 };
        statusResposta = "ENVIADO";
      } else if (!r.ok && r.skipped) {
        gzappyResult = { ok: false, skipped: true };
        statusResposta = "SEM_GZAPPY";
      } else {
        gzappyResult = {
          ok: false,
          skipped: false,
          status: Number((r as any).status) || 500,
          data: (r as any).data,
          erro: "Falha no envio via Gzappy.",
        };
        statusResposta = "FALHA";
      }
    } catch (e: any) {
      gzappyResult = { ok: false, skipped: false, status: 500, erro: e?.message || "Erro desconhecido ao enviar." };
      statusResposta = "FALHA";
    }
  } else {
    statusResposta = row.whatsappStatus;
    if (statusResposta === "PENDENTE") statusResposta = "SEM_GZAPPY";
  }

  const rowPersisted = createdOrReused.podeReenviar
    ? await registrarEnvioGzappy({
        row,
        mensagemFinal,
        linkCriarPerfilUsado: linkCriarPerfil,
        result: gzappyResult,
      })
    : row;

  const respostaEnvio =
    "ok" in gzappyResult && gzappyResult.ok && !gzappyResult.skipped
      ? { ok: true, skipped: false, statusCode: 200 }
      : "ok" in gzappyResult && !gzappyResult.ok && gzappyResult.skipped
        ? { ok: false, skipped: true }
        : {
            ok: false,
            skipped: false,
            statusCode: Number((gzappyResult as any).status) || 500,
            erroPrivado: statusResposta === "FALHA" ? "Falha no envio. Use o link manual ou tente novamente." : undefined,
          };

  return NextResponse.json(
    {
      ok: true,
      conviteId: rowPersisted.id,
      status: rowPersisted.whatsappStatus || statusResposta,
      linkCriarPerfil,
      whatsappMascarado: maskWhatsapp(rowPersisted.parceiroWhatsappNormalizado),
      parceiroNome: rowPersisted.parceiroNome,
      aviso,
      mensagemPreview: mensagemFinal.split("\n").slice(0, 6).join("\n"),
      envio: respostaEnvio,
      metadata: {
        torneioNome: meta.torneioNome,
        categoriaNome: meta.categoriaNome,
        atletaConvidanteNome: atleta.nome || null,
        rateLimit: createdOrReused.statusRateLimit,
        esperaSegundos: createdOrReused.esperaSegundos,
        isFresh: createdOrReused.isFresh,
      },
    },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
