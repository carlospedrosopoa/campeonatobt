import { NextResponse } from "next/server";
import { getAppAtletaUrl } from "@/lib/app-atleta-url";

export async function GET() {
  return NextResponse.redirect(getAppAtletaUrl());
}
