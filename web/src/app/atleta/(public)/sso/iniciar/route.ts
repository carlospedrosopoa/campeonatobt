import { NextRequest, NextResponse } from "next/server";

function cleanBaseUrl(raw: string) {
  let base = (raw || "").trim();
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

export async function GET(request: NextRequest) {
  const appAtletaBaseRaw = process.env.NEXT_PUBLIC_APPATLETA_URL || process.env.APPATLETA_URL || "";
  const appAtletaBase = cleanBaseUrl(appAtletaBaseRaw);
  if (!appAtletaBase) {
    return NextResponse.redirect(new URL("/atleta/login?erro=sso_indisponivel", request.url));
  }

  const origin = new URL(request.url).origin;
  const callback = `${origin}/atleta/sso`;
  const url = new URL("/login", appAtletaBase);
  url.searchParams.set("nextExternal", callback);
  return NextResponse.redirect(url);
}

