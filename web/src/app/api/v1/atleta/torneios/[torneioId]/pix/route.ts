import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { db } from "@/db";
import { categorias, equipeIntegrantes, inscricaoPagamentos, inscricoes, torneios } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
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
  { params }: { params: Promise<{ torneioId: string }> }
) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { torneioId } = await params;
  const tId = (torneioId || "").trim();
  if (!tId) return NextResponse.json({ error: "torneioId inválido" }, { status: 400 });

  const torneioRows = await db
    .select({
      id: torneios.id,
      nome: torneios.nome,
      pixChave: torneios.pixChave,
      pixNome: torneios.pixNome,
      pixCidade: torneios.pixCidade,
    })
    .from(torneios)
    .where(eq(torneios.id, tId))
    .limit(1);
  const torneioData = torneioRows[0];
  if (!torneioData) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  const pixChave = (torneioData.pixChave || "").trim();
  const pixNome = (torneioData.pixNome || "").trim();
  const pixCidade = (torneioData.pixCidade || "").trim();
  if (!pixChave || !pixNome || !pixCidade) {
    return NextResponse.json({ error: "PIX não configurado para este torneio" }, { status: 400 });
  }

  const rows = await db
    .select({
      inscricaoId: inscricoes.id,
      categoriaNome: categorias.nome,
      categoriaValorInscricao: categorias.valorInscricao,
      pago: inscricaoPagamentos.pago,
      pagamentoStatus: inscricaoPagamentos.status,
      valorDevido: inscricaoPagamentos.valorDevido,
    })
    .from(inscricoes)
    .innerJoin(categorias, eq(inscricoes.categoriaId, categorias.id))
    .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
    .leftJoin(
      inscricaoPagamentos,
      and(eq(inscricaoPagamentos.inscricaoId, inscricoes.id), eq(inscricaoPagamentos.usuarioId, auth.user.id))
    )
    .where(
      and(
        eq(inscricoes.torneioId, tId),
        eq(equipeIntegrantes.usuarioId, auth.user.id),
        sql`coalesce(${inscricaoPagamentos.pago}, false) = false`,
        sql`coalesce(${inscricaoPagamentos.status}, 'PENDENTE') = 'PENDENTE'`
      )
    );

  const itens = rows
    .map((r) => {
      const valorRaw = (r.valorDevido ?? r.categoriaValorInscricao ?? null) as string | null;
      const valorFmt = valorRaw ? formatAmount(valorRaw) : null;
      const valorNum = valorFmt ? Number(valorFmt) : 0;
      return {
        inscricaoId: r.inscricaoId,
        categoriaNome: String(r.categoriaNome || ""),
        status: r.pagamentoStatus ?? (Boolean(r.pago) ? "PAGO" : "PENDENTE"),
        valor: valorFmt,
        valorNum,
      };
    })
    .filter((i) => i.valorNum > 0);

  if (itens.length === 0) {
    return NextResponse.json({ error: "Nenhuma inscrição pendente com valor para pagamento" }, { status: 400 });
  }

  const totalNum = itens.reduce((acc, i) => acc + i.valorNum, 0);
  const totalFmt = formatAmount(String(totalNum));
  if (!totalFmt) {
    return NextResponse.json({ error: "Nenhuma inscrição pendente com valor para pagamento" }, { status: 400 });
  }

  const txid = onlyAsciiUpper(`T${torneioData.id.replace(/-/g, "").slice(0, 24)}`, 25);
  const descricao = onlyAsciiUpper(`${torneioData.nome} - PAGAMENTO INSCRICOES`, 60);

  const payload = buildPixPayload({
    chave: pixChave,
    nome: pixNome,
    cidade: pixCidade,
    txid,
    descricao,
    valor: totalFmt,
  });

  const svg = await QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 2 });

  return NextResponse.json(
    {
      valor: totalFmt,
      payload,
      svg,
      torneio: { id: torneioData.id, nome: torneioData.nome },
      itens,
    },
    { headers: { "Cache-Control": "no-store", Vary: "Authorization" } }
  );
}

