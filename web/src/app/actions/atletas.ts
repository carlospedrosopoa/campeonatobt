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

// Variáveis de ambiente
const API_URL = process.env.PLAYNAQUADRA_API_URL;
const ADMIN_EMAIL = process.env.PLAYNAQUADRA_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYNAQUADRA_ADMIN_PASSWORD;

// Cache simples para token (em memória do processo serverless/container)
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getAuthToken() {
    if (!API_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.warn("⚠️ Credenciais do PlayNaQuadra não configuradas.");
        return null;
    }

    // Se temos token válido, usa ele
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    try {
        console.log("🔐 Autenticando no PlayNaQuadra...");
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
            cache: "no-store"
        });

        if (!res.ok) {
            console.error("❌ Falha no login PlayNaQuadra:", await res.text());
            return null;
        }

        const data = await res.json();
        const token = data.token;

        if (token) {
            cachedToken = token;
            // Define expiração segura (ex: 50 minutos se o token dura 1h)
            tokenExpiresAt = Date.now() + (50 * 60 * 1000); 
            return token;
        }
    } catch (error) {
        console.error("❌ Erro ao conectar no PlayNaQuadra:", error);
    }
    return null;
}

export async function searchAtletas(query: string): Promise<ExternalUser[]> {
  if (!query || query.length < 3) return [];

  const results: ExternalUser[] = [];

  // 1. Buscar na API do PlayNaQuadra (Prioridade)
  try {
    const token = await getAuthToken();

    if (token && API_URL) {
        // Como a API não tem rota de busca pública, vamos listar usuários e filtrar
        // ATENÇÃO: Em produção com muitos usuários, isso deve ser otimizado na API externa (criar endpoint /search)
        
        console.log("🔍 Buscando na API externa:", `${API_URL}/api/user/list`);
        const res = await fetch(`${API_URL}/api/user/list`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: "no-store" // Garante dados frescos
        });

        if (res.ok) {
            const allUsers = await res.json();
            console.log("✅ Usuários encontrados na API:", allUsers.length);
            
            // Filtrar localmente
            const filtered = allUsers
                .filter((u: any) => {
                    const name = (u.name || u.nome || "").toLowerCase();
                    const email = (u.email || "").toLowerCase();
                    const q = query.toLowerCase();
                    return name.includes(q) || email.includes(q);
                })
                .slice(0, 20) // Limita resultados
                .map((u: any) => ({
                    id: u.id,
                    name: u.name || u.nome,
                    email: u.email,
                    avatarUrl: u.avatarUrl || u.foto,
                    isExternal: true
                }));
            
            console.log("✅ Resultados filtrados:", filtered.length);
            results.push(...filtered);
        } else {
            console.error("❌ Erro ao listar usuários do PlayNaQuadra:", res.status, await res.text());
        }
    } else {
        // MOCK: Se não tiver config, usa mock para dev
        console.log("🔍 [MOCK] Buscando no PlayNaQuadra por:", query);
        const mockUsers = [
            { id: "pnq-1", name: "João da Silva", email: "joao@teste.com", isExternal: true },
            { id: "pnq-2", name: "Maria Oliveira", email: "maria@teste.com", isExternal: true },
            { id: "pnq-3", name: "Pedro Santos", email: "pedro@teste.com", isExternal: true },
            { id: "pnq-4", name: "Ana Costa", email: "ana@teste.com", isExternal: true },
            { id: "pnq-5", name: "Lucas Pereira", email: "lucas@teste.com", isExternal: true },
            { id: "pnq-6", name: "Fernanda Lima", email: "fernanda@teste.com", isExternal: true },
            { id: "pnq-7", name: "Carlos Pedroso", email: "carlospedrosopoa@gmail.com", isExternal: true },
        ].filter(u => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.includes(query.toLowerCase()));
        
        results.push(...mockUsers);
    }
  } catch (error) {
    console.error("Erro ao buscar no PlayNaQuadra:", error);
  }

  // 2. Buscar no Banco Local (opcional, se quisermos misturar resultados)
  // Por enquanto, confiamos na busca externa ou mock

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
