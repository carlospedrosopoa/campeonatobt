import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tournaments, categories, registrations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Await params if it's a promise (Next.js 15)
    const { slug } = await params;

    // Verificar permissão
    const session = await getSession();
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'ORGANIZER')) {
      return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
    }

    // 1. Buscar o torneio
    const tournamentResult = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.slug, slug))
      .limit(1);

    const tournament = tournamentResult[0];

    if (!tournament) {
      return NextResponse.json(
        { message: 'Torneio não encontrado' },
        { status: 404 }
      );
    }

    // 2. Buscar as categorias desse torneio
    const categoriesResult = await db
      .select()
      .from(categories)
      .where(eq(categories.tournamentId, tournament.id));

    // 3. Buscar inscrições
    // Para simplificar, buscamos tudo e filtramos (ou poderíamos fazer joins)
    // Vamos buscar todas as inscrições que pertencem às categorias deste torneio
    const catIds = categoriesResult.map(c => c.id);
    let inscriptionsWithDetails: any[] = [];

    if (catIds.length > 0) {
       // Buscar inscrições e dados de usuários
       const allRegs = await db.select().from(registrations); // Ineficiente se tiver muitos dados, mas ok para MVP
       const allUsers = await db.select().from(users);

       inscriptionsWithDetails = allRegs
        .filter(r => catIds.includes(r.categoryId))
        .map(r => {
            const cat = categoriesResult.find(c => c.id === r.categoryId);
            const p1 = allUsers.find(u => u.id === r.player1Id);
            const p2 = allUsers.find(u => u.id === r.player2Id);
            return {
                ...r,
                categoryName: cat?.name,
                player1: p1,
                player2: p2
            };
        });
    }

    return NextResponse.json({
      tournament,
      categories: categoriesResult,
      inscriptions: inscriptionsWithDetails
    });
  } catch (error) {
    console.error('Error fetching admin tournament details:', error);
    return NextResponse.json(
      { message: 'Erro ao buscar detalhes do torneio' },
      { status: 500 }
    );
  }
}
