"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface ExternalUser {
  id: string; // ID do PlayNaQuadra ou Local
  name: string;
  email: string;
  avatarUrl?: string;
  isExternal?: boolean; // Flag para saber se precisa importar
}

export async function searchAtletas(query: string): Promise<ExternalUser[]> {
  if (!query || query.length < 3) return [];

  const results: ExternalUser[] = [];
  const playNaQuadraUrl = process.env.PLAYNAQUADRA_API_URL;

  // 1. Buscar na API do PlayNaQuadra (Prioridade)
  try {
    if (playNaQuadraUrl && !playNaQuadraUrl.includes("playnaquadra.com.br/api")) {
        // Fetch real
        const res = await fetch(`${playNaQuadraUrl}/users/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${process.env.JWT_SECRET}` } // Exemplo de auth S2S
        });
        if (res.ok) {
            const data = await res.json();
            // Mapear resposta para ExternalUser
            const externalUsers = (data.users || []).map((u: any) => ({
                id: u.id,
                name: u.name || u.nome,
                email: u.email,
                avatarUrl: u.avatarUrl || u.foto,
                isExternal: true
            }));
            results.push(...externalUsers);
        }
    } else {
        // MOCK: Simular busca externa
        console.log("🔍 [MOCK] Buscando no PlayNaQuadra por:", query);
        const mockUsers = [
            { id: "pnq-1", name: "João da Silva", email: "joao@teste.com", isExternal: true },
            { id: "pnq-2", name: "Maria Oliveira", email: "maria@teste.com", isExternal: true },
            { id: "pnq-3", name: "Pedro Santos", email: "pedro@teste.com", isExternal: true },
        ].filter(u => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.includes(query.toLowerCase()));
        
        results.push(...mockUsers);
    }
  } catch (error) {
    console.error("Erro ao buscar no PlayNaQuadra:", error);
  }

  // 2. Buscar no Banco Local (para garantir que encontramos quem já foi importado mas talvez não venha na busca externa)
  // Opcional: Se a API externa for a fonte única, podemos pular isso. 
  // Mas é bom ter caso o atleta tenha mudado de nome localmente ou algo assim.

  return results;
}

export async function importAtleta(externalUser: ExternalUser) {
    // Verifica se já existe pelo email ou playnaquadraId
    const existing = await db.select().from(users).where(eq(users.email, externalUser.email)).limit(1);
    
    if (existing.length > 0) {
        // Já existe, atualiza ID externo se precisar
        const user = existing[0];
        if (!user.playnaquadraId) {
            await db.update(users).set({ playnaquadraId: externalUser.id }).where(eq(users.id, user.id));
        }
        return user;
    }

    // Não existe, cria
    const [newUser] = await db.insert(users).values({
        name: externalUser.name,
        email: externalUser.email,
        playnaquadraId: externalUser.id,
        role: 'PLAYER',
        avatarUrl: externalUser.avatarUrl
    }).returning();

    return newUser;
}
