import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession, getSessionFromToken } from "@/lib/auth";
import { smartDoTorneio } from "@/services/smart-torneio.service";
import { torneiosService } from "@/services/torneios.service";
import { torneioAdministradoresService } from "@/services/torneio-administradores.service";

type SessionLikeUser = {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA";
};

export function isGlobalAdmin(perfil?: string) {
  return perfil === "ADMIN";
}

export function isTournamentOperator(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

export async function requireGlobalAdmin() {
  const session = await getSession();
  const user = session?.user as SessionLikeUser | undefined;

  if (!user || !isGlobalAdmin(user.perfil)) {
    return { response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) } as const;
  }

  return { user } as const;
}

/** Sessao do site (cookie) ou do app (Bearer, enviado pelo appatleta via proxy). */
async function usuarioDaRequisicao(): Promise<SessionLikeUser | undefined> {
  const session = await getSession();
  if (session?.user) return session.user as SessionLikeUser;
  const auth = (await headers()).get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (!token) return undefined;
  return ((await getSessionFromToken(token))?.user as SessionLikeUser | undefined) ?? undefined;
}

/** Rotas de gestao que o criador de Smart Torneio (atleta) nao pode usar. */
export function negarCriadorSmart(acesso: object) {
  return (acesso as { criadorSmart?: boolean }).criadorSmart
    ? NextResponse.json({ error: "Esta ação não está disponível para o criador do Smart Torneio" }, { status: 403 })
    : null;
}

export async function requireTournamentAdminBySlug(slug: string) {
  const user = await usuarioDaRequisicao();
  if (!user) {
    return { response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) } as const;
  }

  const torneio = await torneiosService.buscarPorSlug(slug);
  if (!torneio) {
    return { response: NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 }) } as const;
  }

  // atleta criador de Smart Torneio gerencia so o proprio torneio, depois de autorizado
  if (!isTournamentOperator(user.perfil)) {
    const smart = await smartDoTorneio(torneio.id);
    if (smart && smart.status === "APROVADO" && smart.criadorUsuarioId === user.id) {
      return { user, torneio, criadorSmart: true } as const;
    }
    return { response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) } as const;
  }

  if (user.perfil === "ADMIN") {
    return { user, torneio } as const;
  }

  const permitido = await torneioAdministradoresService.usuarioPodeAdministrarTorneio({
    torneioId: torneio.id,
    userId: user.id,
    organizadorId: torneio.organizadorId,
  });

  if (!permitido) {
    return { response: NextResponse.json({ error: "Acesso negado para este torneio" }, { status: 403 }) } as const;
  }

  return { user, torneio } as const;
}
