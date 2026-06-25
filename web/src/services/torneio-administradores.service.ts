import { db } from "@/db";
import { torneioAdministradores, torneios, usuarios } from "@/db/schema";
import { and, asc, eq, inArray, or } from "drizzle-orm";

type UsuarioGestao = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA";
};

export class TorneioAdministradoresService {
  private async carregarUsuariosValidos(usuarioIds: string[]) {
    if (usuarioIds.length === 0) return [];

    return await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
      })
      .from(usuarios)
      .where(
        and(
          inArray(usuarios.id, usuarioIds),
          or(eq(usuarios.perfil, "ADMIN"), eq(usuarios.perfil, "ORGANIZADOR"))
        )
      );
  }

  async validarUsuariosGestao(organizadorId: string, administradorIds: string[]) {
    const todosIds = Array.from(new Set([organizadorId, ...administradorIds].filter(Boolean)));
    const usuariosValidos = await this.carregarUsuariosValidos(todosIds);
    const validosSet = new Set(usuariosValidos.map((usuario) => usuario.id));

    if (!validosSet.has(organizadorId)) {
      throw new Error("Organizador principal inválido");
    }

    return Array.from(new Set(administradorIds.filter((id) => id !== organizadorId && validosSet.has(id))));
  }

  async listarPorTorneio(torneioId: string): Promise<UsuarioGestao[]> {
    return await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        perfil: usuarios.perfil,
      })
      .from(torneioAdministradores)
      .innerJoin(usuarios, eq(torneioAdministradores.usuarioId, usuarios.id))
      .where(eq(torneioAdministradores.torneioId, torneioId))
      .orderBy(asc(usuarios.nome));
  }

  async listarComOrganizadorPrincipal(torneioId: string) {
    const torneio = await db
      .select({
        id: torneios.id,
        organizadorId: torneios.organizadorId,
        organizadorNome: usuarios.nome,
        organizadorEmail: usuarios.email,
        organizadorTelefone: usuarios.telefone,
        organizadorPerfil: usuarios.perfil,
      })
      .from(torneios)
      .innerJoin(usuarios, eq(torneios.organizadorId, usuarios.id))
      .where(eq(torneios.id, torneioId))
      .limit(1);

    const principal = torneio[0]
      ? {
          id: torneio[0].organizadorId,
          nome: torneio[0].organizadorNome,
          email: torneio[0].organizadorEmail,
          telefone: torneio[0].organizadorTelefone,
          perfil: torneio[0].organizadorPerfil,
        }
      : null;

    const administradores = await this.listarPorTorneio(torneioId);

    return { principal, administradores };
  }

  async listarTorneioIdsGerenciaveis(userId: string): Promise<string[]> {
    const [comoPrincipal, comoAdmin] = await Promise.all([
      db.select({ id: torneios.id }).from(torneios).where(eq(torneios.organizadorId, userId)),
      db
        .select({ id: torneioAdministradores.torneioId })
        .from(torneioAdministradores)
        .where(eq(torneioAdministradores.usuarioId, userId)),
    ]);

    return Array.from(new Set([...comoPrincipal.map((item) => item.id), ...comoAdmin.map((item) => item.id)]));
  }

  async usuarioPodeAdministrarTorneio(params: { torneioId: string; userId: string; organizadorId?: string | null }) {
    if (params.organizadorId && params.organizadorId === params.userId) return true;

    const vinculo = await db
      .select({ id: torneioAdministradores.id })
      .from(torneioAdministradores)
      .where(and(eq(torneioAdministradores.torneioId, params.torneioId), eq(torneioAdministradores.usuarioId, params.userId)))
      .limit(1);

    return Boolean(vinculo[0]);
  }

  async sincronizar(torneioId: string, organizadorId: string, administradorIds: string[]) {
    const extras = await this.validarUsuariosGestao(organizadorId, administradorIds);

    await db.transaction(async (tx) => {
      await tx
        .update(torneios)
        .set({
          organizadorId,
          atualizadoEm: new Date(),
        })
        .where(eq(torneios.id, torneioId));

      await tx.delete(torneioAdministradores).where(eq(torneioAdministradores.torneioId, torneioId));

      if (extras.length > 0) {
        await tx.insert(torneioAdministradores).values(
          extras.map((usuarioId) => ({
            torneioId,
            usuarioId,
          }))
        );
      }
    });

    return await this.listarComOrganizadorPrincipal(torneioId);
  }
}

export const torneioAdministradoresService = new TorneioAdministradoresService();
