import { NextRequest, NextResponse } from "next/server";
import { requireGlobalAdmin, requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { torneioAdministradoresService } from "@/services/torneio-administradores.service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;

    const gestao = await torneioAdministradoresService.listarComOrganizadorPrincipal(acesso.torneio.id);
    return NextResponse.json({
      podeEditarPermissoes: acesso.user.perfil === "ADMIN",
      organizadorPrincipal: gestao.principal,
      administradores: gestao.administradores,
    });
  } catch (error) {
    console.error("Erro ao carregar administradores do torneio:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const acesso = await requireGlobalAdmin();
    if ("response" in acesso) return acesso.response;

    const { slug } = await params;
    const torneioAcesso = await requireTournamentAdminBySlug(slug);
    if ("response" in torneioAcesso) return torneioAcesso.response;

    const body = await request.json().catch(() => null);
    const organizadorId = typeof body?.organizadorId === "string" ? body.organizadorId : "";
    const administradorIds = Array.isArray(body?.administradorIds) ? body.administradorIds.filter((id: unknown) => typeof id === "string") : [];

    if (!organizadorId) {
      return NextResponse.json({ error: "Organizador principal é obrigatório" }, { status: 400 });
    }

    const gestao = await torneioAdministradoresService.sincronizar(torneioAcesso.torneio.id, organizadorId, administradorIds);

    return NextResponse.json({
      podeEditarPermissoes: true,
      organizadorPrincipal: gestao.principal,
      administradores: gestao.administradores,
    });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    console.error("Erro ao salvar administradores do torneio:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
