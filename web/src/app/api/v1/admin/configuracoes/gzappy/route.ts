import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { gzappyConfigService } from "@/services/gzappy-config.service";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN";
}

export async function GET() {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;
  if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const config = await gzappyConfigService.obter();
  return NextResponse.json(config, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;
  if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as any;
  const ativo = body?.ativo === true;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey : null;
  const instanceId = typeof body?.instanceId === "string" ? body.instanceId : null;
  const whatsappArbitragem = typeof body?.whatsappArbitragem === "string" ? body.whatsappArbitragem : null;

  await gzappyConfigService.salvar({ ativo, apiKey, instanceId, whatsappArbitragem });
  const config = await gzappyConfigService.obter();
  return NextResponse.json(config, { headers: { "Cache-Control": "no-store" } });
}

