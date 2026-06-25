import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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

export async function requireTournamentAdminBySlug(slug: string) {
  const session = await getSession();
  const user = session?.user as SessionLikeUser | undefined;

  if (!user || !isTournamentOperator(user.perfil)) {
    return { response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) } as const;
  }

  const torneio = await torneiosService.buscarPorSlug(slug);
  if (!torneio) {
    return { response: NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 }) } as const;
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
