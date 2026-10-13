import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { playGetAtletaMe } from "@/services/playnaquadra-client";

function decodeJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function extractPlayIdentity(me: any, tokenPlay: string) {
  const jwtPayload = decodeJwtPayload(tokenPlay);
  // So o id do perfil de atleta. O id da conta (jwt.id / me.id) NAO serve: /atleta/{id} do Play responde 404 com ele.
  const atletaId =
    (me?.atletaId as string | undefined | null) ??
    (me?.user?.atletaId as string | undefined | null) ??
    (me?.usuario?.atletaId as string | undefined | null) ??
    (jwtPayload?.atletaId as string | undefined | null) ??
    null;

  const email =
    (((me?.email as string | undefined) ??
      (me?.user?.email as string | undefined) ??
      (me?.usuario?.email as string | undefined) ??
      (jwtPayload?.email as string | undefined) ??
      "") as string)
      .trim()
      .toLowerCase();

  const nome =
    ((me?.name as string | undefined) ??
      (me?.nome as string | undefined) ??
      (me?.user?.name as string | undefined) ??
      (me?.user?.nome as string | undefined) ??
      (jwtPayload?.name as string | undefined) ??
      (jwtPayload?.nome as string | undefined) ??
      "") as string;

  const telefone =
    (((me?.whatsapp as string | undefined) ?? (me?.telefone as string | undefined) ?? (jwtPayload?.whatsapp as string | undefined) ?? "") as string).trim();

  function normalizeGeneroInline(value: unknown): string | null {
    const normalized = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    if (["m", "masculino", "male", "homem"].includes(normalized)) return "MASCULINO";
    if (["f", "feminino", "female", "mulher"].includes(normalized)) return "FEMININO";
    return null;
  }

  const generoRaw =
    (me?.genero as unknown) ??
    (me?.sexo as unknown) ??
    (me?.gender as unknown) ??
    (me?.atleta?.genero as unknown) ??
    (me?.atleta?.sexo as unknown) ??
    (me?.user?.genero as unknown) ??
    (me?.user?.sexo as unknown) ??
    (me?.usuario?.genero as unknown) ??
    (me?.usuario?.sexo as unknown) ??
    (jwtPayload?.genero as unknown) ??
    (jwtPayload?.sexo as unknown) ??
    null;
  const genero = normalizeGeneroInline(generoRaw) || null;

  return { atletaId, email, nome: nome.trim(), telefone, genero };
}

/** Id do perfil de atleta no Play: o do usuario logado ou, se nao vier, o de /atleta/me/atleta. */
export function atletaIdDoPerfilPlay(data: any): string | null {
  const id = data?.id ?? data?.atleta?.id ?? data?.data?.id ?? null;
  return id ? String(id) : null;
}

export async function createOrUpdateAtletaFromPlayToken(params: { tokenPlay: string; me: any }) {
  const { tokenPlay, me } = params;
  const identity = extractPlayIdentity(me, tokenPlay);
  if (!identity.atletaId) {
    const atletaMe = await playGetAtletaMe(tokenPlay).catch(() => null);
    if (atletaMe?.res.ok) identity.atletaId = atletaIdDoPerfilPlay(atletaMe.data);
  }

  if (!identity.email) throw new Error("Usuário do Play na Quadra sem email");

  const existentePorAtleta = identity.atletaId
    ? await db
        .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil, playnaquadraAtletaId: usuarios.playnaquadraAtletaId })
        .from(usuarios)
        .where(eq(usuarios.playnaquadraAtletaId, identity.atletaId))
        .limit(1)
    : [];

  let userId: string;
  let perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA" = "ATLETA";

  if (existentePorAtleta.length > 0) {
    const u = existentePorAtleta[0];
    userId = u.id;
    perfil = u.perfil as any;
    await db
      .update(usuarios)
      .set({
        nome: identity.nome || u.nome,
        email: identity.email,
        telefone: identity.telefone || null,
        atualizadoEm: new Date(),
      })
      .where(eq(usuarios.id, userId));
  } else {
    const existentePorEmail = await db
      .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil, playnaquadraAtletaId: usuarios.playnaquadraAtletaId })
      .from(usuarios)
      .where(eq(usuarios.email, identity.email))
      .limit(1);

    if (existentePorEmail.length > 0) {
      const u = existentePorEmail[0];
      if (u.perfil !== "ATLETA") throw new Error("Email já está vinculado a um usuário não-atleta");
      userId = u.id;
      await db
        .update(usuarios)
        .set({
          nome: identity.nome || u.nome,
          telefone: identity.telefone || null,
          // sem perfil de atleta identificado, mantem o vinculo que ja existe
          ...(identity.atletaId ? { playnaquadraAtletaId: identity.atletaId } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(usuarios.id, userId));
    } else {
      if (!identity.atletaId) throw new Error("Não foi possível identificar o atleta no Play na Quadra");
      const [novo] = await db
        .insert(usuarios)
        .values({
          nome: identity.nome || identity.email.split("@")[0],
          email: identity.email,
          telefone: identity.telefone || null,
          perfil: "ATLETA",
          playnaquadraAtletaId: identity.atletaId,
        })
        .returning({ id: usuarios.id });
      userId = novo.id;
    }
  }

  const sessionToken = await createSession({
    id: userId,
    nome: identity.nome || identity.email.split("@")[0],
    email: identity.email,
    perfil,
    playnaquadraAtletaId: identity.atletaId,
  });

  return {
    sessionToken,
    user: { id: userId, nome: identity.nome || identity.email.split("@")[0], email: identity.email, perfil, playnaquadraAtletaId: identity.atletaId },
  };
}

