import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrations } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'ORGANIZER')) {
      return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { categoryId, player1Id, player2Id, status } = body;

    await db.update(registrations)
      .set({
        categoryId,
        player1Id,
        player2Id,
        status
      })
      .where(eq(registrations.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update error:', error);
    return NextResponse.json({ message: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'ORGANIZER')) {
      return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
    }

    const { id } = await params;

    await db.delete(registrations).where(eq(registrations.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json({ message: 'Erro ao excluir' }, { status: 500 });
  }
}
