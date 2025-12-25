import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations } from '@/db/schema';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Verificar permissão
    const session = await getSession();
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'ORGANIZER')) {
      return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { categoryId, player1Id, player2Id, status, paymentStatus } = body;

    if (!categoryId || !player1Id || !player2Id) {
      return NextResponse.json({ message: 'Dados incompletos' }, { status: 400 });
    }

    // Criar inscrição
    const [newRegistration] = await db.insert(registrations).values({
      categoryId,
      player1Id,
      player2Id,
      status: status || 'APPROVED',
      // paymentStatus não existe no schema inicial, vamos ignorar ou adicionar depois se necessário
      // O schema tem status: PENDING, APPROVED, REJECTED, PAID.
      // Se pagou, status = PAID. Se aprovou mas não pagou, APPROVED.
    }).returning();

    return NextResponse.json({ success: true, registration: newRegistration });

  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ message: 'Erro ao criar inscrição' }, { status: 500 });
  }
}
