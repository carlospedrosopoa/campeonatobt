import { NextResponse } from 'next/server';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const allTournaments = await db
      .select()
      .from(tournaments)
      .orderBy(desc(tournaments.startDate));

    return NextResponse.json(allTournaments);
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return NextResponse.json(
      { message: 'Erro ao buscar torneios' },
      { status: 500 }
    );
  }
}
