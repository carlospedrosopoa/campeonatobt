import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tournaments, categories } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

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

    return NextResponse.json({
      ...tournament,
      categories: categoriesResult,
    });
  } catch (error) {
    console.error('Error fetching tournament details:', error);
    return NextResponse.json(
      { message: 'Erro ao buscar detalhes do torneio' },
      { status: 500 }
    );
  }
}
