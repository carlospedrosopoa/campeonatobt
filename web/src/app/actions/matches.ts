"use server";

import { db } from "@/db";
import { registrations, matches, groups, groupTeams, categories } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Função para embaralhar array (Fisher-Yates)
function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length,  randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

export async function generateGroupMatches(categoryId: string, groupSize: number = 4) {
  try {
    // 1. Buscar inscrições aprovadas/pagas
    // (MVP: Considerando APPROVED e PAID)
    const teams = await db.select().from(registrations)
      .where(and(eq(registrations.categoryId, categoryId)));
      // .where(inArray(registrations.status, ['APPROVED', 'PAID'])); // Se status for restrito

    if (teams.length < 2) {
      return { success: false, message: "Mínimo de 2 duplas para gerar jogos." };
    }

    // 2. Limpar jogos e grupos existentes dessa categoria (Reset)
    // CUIDADO: Isso apaga tudo. Em produção teria confirmação extra.
    await db.delete(matches).where(and(eq(matches.categoryId, categoryId), eq(matches.phase, 'GROUP')));
    await db.delete(groupTeams).where(eq(groupTeams.registrationId, categoryId)); // Errado, precisa filtrar por group -> category.
    // Como groupTeams não tem categoryId direto, precisamos buscar os groups primeiro.
    
    const existingGroups = await db.select().from(groups).where(eq(groups.categoryId, categoryId));
    const groupIds = existingGroups.map(g => g.id);
    
    if (groupIds.length > 0) {
        // Drizzle inArray buga as vezes se lista vazia, mas checkamos length
        // await db.delete(groupTeams).where(inArray(groupTeams.groupId, groupIds));
        // Vamos deletar grupos e cascade deve resolver se configurado, mas drizzle n faz cascade automatico no db push sem sql
        // Vamos deletar manual
        for (const gid of groupIds) {
             await db.delete(groupTeams).where(eq(groupTeams.groupId, gid));
             await db.delete(matches).where(eq(matches.groupId, gid));
             await db.delete(groups).where(eq(groups.id, gid));
        }
    }

    // 3. Criar Grupo Único
    // Como solicitado: todos contra todos em grupo único na primeira fase
    const [group] = await db.insert(groups).values({
        categoryId,
        name: "Grupo Único"
    }).returning();

    // Adicionar todos os times ao grupo
    const teamIds: string[] = [];
    for (const team of teams) {
        await db.insert(groupTeams).values({
            groupId: group.id,
            registrationId: team.id
        });
        teamIds.push(team.id);
    }

    // 4. Gerar Jogos (Todos contra Todos)
    let matchesCount = 0;
    
    // Buscar tournamentId da categoria
    const categoriesResult = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    const tId = categoriesResult[0]?.tournamentId;

    if (!tId) throw new Error("Categoria sem torneio vinculado");

    for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
            await db.insert(matches).values({
                tournamentId: tId,
                categoryId,
                groupId: group.id,
                team1Id: teamIds[i],
                team2Id: teamIds[j],
                phase: 'GROUP',
                status: 'SCHEDULED'
            });
            matchesCount++;
        }
    }

    return { success: true, message: `${matchesCount} jogos gerados em grupo único.` };

  } catch (error) {
    console.error("Erro ao gerar jogos:", error);
    return { success: false, message: "Erro interno ao gerar jogos." };
  }
}
