import { NextRequest, NextResponse } from "next/server";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { partidas } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

function ymdSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeYmd(value: string | null) {
  const v = (value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return ymdSaoPaulo();
}

function dataHorarioLocalDateSql(targetYmd: string) {
  return sql`timezone('America/Sao_Paulo', timezone('UTC', ${partidas.dataHorario}))::date = ${targetYmd}::date`;
}

function sanitizeUrl(value: string | null | undefined) {
  return String(value || "").replace(/[`'"\s]/g, "").trim();
}

function formatHorario(value: Date | string | null) {
  if (!value) return "";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseMencoes(raw: string | null) {
  const v = (raw || "").trim();
  if (!v) return [];
  const items = v
    .split(/[,\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.startsWith("@") ? x : `@${x}`));
  return Array.from(new Set(items));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  } as Record<string, string>;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const torneio = await torneiosService.buscarPorSlug(slug);
  if (!torneio || torneio.oculto) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404, headers: corsHeaders() });
  }

  const { searchParams } = new URL(request.url);
  const dataYmd = normalizeYmd(searchParams.get("data"));
  const mencoesPadrao = parseMencoes(searchParams.get("mencoes"));

  const rows = await db
    .select({
      id: partidas.id,
      dataHorario: partidas.dataHorario,
      fotoUrl: partidas.fotoUrl,
    })
    .from(partidas)
    .where(and(eq(partidas.torneioId, torneio.id), dataHorarioLocalDateSql(dataYmd)))
    .orderBy(asc(partidas.dataHorario));

  const payload = rows
    .map((r) => ({
      id: String(r.id),
      horario: formatHorario(r.dataHorario as any),
      urlGcs: sanitizeUrl(r.fotoUrl),
      mencoes: mencoesPadrao,
    }))
    .filter((x) => Boolean(x.urlGcs));

  return NextResponse.json(payload, { headers: corsHeaders() });
}

