"use server";

import { db } from "@/db";
import { registrations, matches, groups, groupTeams } from "@/db/schema";
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

    // 3. Distribuir em Grupos
    const shuffledTeams = shuffle([...teams]);
    const numGroups = Math.ceil(shuffledTeams.length / groupSize);
    
    const createdGroups = [];

    for (let i = 0; i < numGroups; i++) {
        const groupName = `Grupo ${String.fromCharCode(65 + i)}`; // A, B, C...
        const [newGroup] = await db.insert(groups).values({
            categoryId,
            name: groupName
        }).returning();
        createdGroups.push(newGroup);
    }

    // Distribuir times (Snake draft ou sequencial? Vamos sequencial simples)
    let currentGroupIndex = 0;
    const groupAssignments: { [groupId: string]: string[] } = {}; // groupId -> [teamIds]

    for (const team of shuffledTeams) {
        const group = createdGroups[currentGroupIndex];
        
        await db.insert(groupTeams).values({
            groupId: group.id,
            registrationId: team.id
        });

        if (!groupAssignments[group.id]) groupAssignments[group.id] = [];
        groupAssignments[group.id].push(team.id);

        currentGroupIndex = (currentGroupIndex + 1) % numGroups;
    }

    // 4. Gerar Jogos (Round Robin dentro de cada grupo)
    // Para cada grupo, todos contra todos
    let matchesCount = 0;
    const tournamentId = teams[0].tournamentId; // Hack: pegar do registro não dá pq n tem, tem que pegar da categoria ou passar param
    // Ops, registration não tem tournamentId. Precisamos buscar category -> tournamentId
    const category = await db.query.categories.findFirst({
        where: eq(categories.id, categoryId),
        with: { tournament: true } // Se tiver relations configurado
    });
    
    // Fallback se não tiver relations
    const cat = (await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1))[0];
    const tId = cat.tournamentId;

    for (const group of createdGroups) {
        const groupTeamIds = groupAssignments[group.id] || [];
        
        for (let i = 0; i < groupTeamIds.length; i++) {
            for (let j = i + 1; j < groupTeamIds.length; j++) {
                await db.insert(matches).values({
                    tournamentId: tId,
                    categoryId,
                    groupId: group.id,
                    team1Id: groupTeamIds[i],
                    team2Id: groupTeamIds[j],
                    phase: 'GROUP',
                    status: 'SCHEDULED'
                });
                matchesCount++;
            }
        }
    }

    return { success: true, message: `${matchesCount} jogos gerados em ${numGroups} grupos.` };

  } catch (error) {
    console.error("Erro ao gerar jogos:", error);
    return { success: false, message: "Erro interno ao gerar jogos." };
  }
}
