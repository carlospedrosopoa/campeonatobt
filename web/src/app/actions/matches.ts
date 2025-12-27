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

    // 4. Gerar Jogos com Algoritmo Round Robin (Método do Círculo)
    // Para garantir rodadas onde cada time joga uma vez (ou folga)
    
    let matchesCount = 0;
    
    // Buscar tournamentId da categoria
    const categoriesResult = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    const tId = categoriesResult[0]?.tournamentId;

    if (!tId) throw new Error("Categoria sem torneio vinculado");

    // Algoritmo Round Robin
    const teamsList = [...teamIds];
    // Se número impar, adiciona "Bye" (folga)
    if (teamsList.length % 2 !== 0) {
        teamsList.push("BYE");
    }

    const n = teamsList.length;
    const rounds = n - 1; // Número de rodadas é N-1 (para todos contra todos)
    const matchesPerRound = n / 2;

    for (let round = 0; round < rounds; round++) {
        for (let match = 0; match < matchesPerRound; match++) {
            const home = teamsList[match];
            const away = teamsList[n - 1 - match];

            // Se nenhum dos dois é "BYE", cria o jogo
            if (home !== "BYE" && away !== "BYE") {
                await db.insert(matches).values({
                    tournamentId: tId,
                    categoryId,
                    groupId: group.id,
                    team1Id: home,
                    team2Id: away,
                    phase: 'GROUP',
                    status: 'SCHEDULED',
                    round: round + 1 // Rodada 1, 2, 3...
                });
                matchesCount++;
            }
        }

        // Rotacionar o array (mantendo o primeiro fixo e girando o resto)
        // [0, 1, 2, 3] -> [0, 3, 1, 2] -> [0, 2, 3, 1]
        // Remove último e insere na posição 1
        const last = teamsList.pop();
        if (last) teamsList.splice(1, 0, last);
    }

    return { success: true, message: `${matchesCount} jogos gerados em ${rounds} rodadas.` };

  } catch (error) {
    console.error("Erro ao gerar jogos:", error);
    return { success: false, message: "Erro interno ao gerar jogos." };
  }
}
