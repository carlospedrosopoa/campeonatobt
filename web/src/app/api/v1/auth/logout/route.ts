import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await logout();
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("play_token", "", { expires: new Date(0), path: "/" });
    return response;
  } catch (error) {
    console.error("Erro no logout:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
