import { NextRequest, NextResponse } from "next/server";

function cleanBaseUrl(raw: string) {
  let base = (raw || "").trim();
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

function safeNext(raw: string | null) {
  const v = (raw || "").trim();
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v.includes("://")) return null;
  if (v.length > 500) return null;
  return v;
}

export async function GET(request: NextRequest) {
  const appAtletaBaseRaw = process.env.NEXT_PUBLIC_APPATLETA_URL || process.env.APPATLETA_URL || "";
  const appAtletaBase = cleanBaseUrl(appAtletaBaseRaw);
  if (!appAtletaBase) {
    return NextResponse.redirect(new URL("/atleta/login?erro=sso_indisponivel", request.url));
  }

  const origin = new URL(request.url).origin;
  const next = safeNext(request.nextUrl.searchParams.get("next")) || "/atleta/torneios";
  const callbackUrl = new URL("/atleta/sso", origin);
  callbackUrl.searchParams.set("next", next);
  const callback = callbackUrl.toString();
  const url = new URL("/criar-conta", appAtletaBase);
  url.searchParams.set("nextExternal", callback);
  return NextResponse.redirect(url);
}
