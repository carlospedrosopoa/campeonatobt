import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, inscricaoPagamentos, inscricoes, torneios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";

function crc16Ccitt(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string) {
  const v = value ?? "";
  const len = String(v.length).padStart(2, "0");
  return `${id}${len}${v}`;
}

function onlyAsciiUpper(value: string, maxLen: number) {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase();
  return normalized.length > maxLen ? normalized.slice(0, maxLen) : normalized;
}

function formatAmount(value: string) {
  const raw = (value || "").trim().replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function buildPixPayload(params: {
  chave: string;
  nome: string;
  cidade: string;
  txid: string;
  descricao?: string | null;
  valor?: string | null;
}) {
  const merchantAccountInfo = [
    tlv("00", "br.gov.bcb.pix"),
    tlv("01", params.chave.trim()),
    params.descricao ? tlv("02", params.descricao.trim()) : "",
  ].join("");

  const additionalData = tlv("05", params.txid);

  const parts = [
    tlv("00", "01"),
    tlv("26", merchantAccountInfo),
    tlv("52", "0000"),
    tlv("53", "986"),
    params.valor ? tlv("54", params.valor) : "",
    tlv("58", "BR"),
    tlv("59", onlyAsciiUpper(params.nome, 25)),
    tlv("60", onlyAsciiUpper(params.cidade, 15)),
    tlv("62", additionalData),
  ].filter(Boolean);

  const base = parts.join("") + "6304";
  const crc = crc16Ccitt(base);
  return base + crc;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ inscricaoId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { inscricaoId } = await params;
  const id = (inscricaoId || "").trim();
  if (!id) return NextResponse.json({ error: "inscricaoId inválido" }, { status: 400 });

  const row = await db
    .select({
      inscricaoId: inscricoes.id,
      torneioId: inscricoes.torneioId,
      categoriaId: inscricoes.categoriaId,
      torneioNome: torneios.nome,
      pixChave: torneios.pixChave,
      pixNome: torneios.pixNome,
      pixCidade: torneios.pixCidade,
      categoriaNome: categorias.nome,
      categoriaValorInscricao: categorias.valorInscricao,
      pago: inscricaoPagamentos.pago,
      pagamentoStatus: inscricaoPagamentos.status,
      valorDevido: inscricaoPagamentos.valorDevido,
      integranteId: equipeIntegrantes.id,
    })
    .from(inscricoes)
    .innerJoin(torneios, eq(inscricoes.torneioId, torneios.id))
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .leftJoin(
      inscricaoPagamentos,
      and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, auth.user.id))
    )
    .where(and(eq(inscricoes.id, id), eq(equipeIntegrantes.usuarioId, auth.user.id)))
    .limit(1);

  const data = row[0];
  if (!data) return NextResponse.json({ error: "Inscrição não encontrada" }, { status: 404 });

  const pixChave = (data.pixChave || "").trim();
  const pixNome = (data.pixNome || "").trim();
  const pixCidade = (data.pixCidade || "").trim();
  if (!pixChave || !pixNome || !pixCidade) {
    return NextResponse.json({ error: "PIX não configurado para este torneio" }, { status: 400 });
  }

  const status = data.pagamentoStatus ?? (Boolean(data.pago) ? "PAGO" : "PENDENTE");
  const pago = status === "PAGO";
  const valorFallback = data.categoriaValorInscricao ?? null;
  const valor = (data.valorDevido ?? valorFallback) as string | null;
  const valorFmt = valor ? formatAmount(valor) : null;

  const txid = onlyAsciiUpper(`INS${data.inscricaoId.replace(/-/g, "").slice(0, 22)}`, 25);
  const descricao = onlyAsciiUpper(`${data.torneioNome} - ${data.categoriaNome}`, 60);

  const payload = buildPixPayload({
    chave: pixChave,
    nome: pixNome,
    cidade: pixCidade,
    txid,
    descricao,
    valor: valorFmt,
  });

  const svg = await QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 2 });

  return NextResponse.json(
    {
      pago,
      status,
      valor: valorFmt,
      payload,
      svg,
      torneio: { nome: data.torneioNome },
    },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}
