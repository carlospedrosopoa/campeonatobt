import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ message: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    // =================================================================================
    // 1. TENTATIVA DE LOGIN LOCAL (Prioridade para Admins/Organizadores com senha)
    // =================================================================================
    const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let user = existingUsers[0];

    if (user && user.password) {
      // Se usuário existe localmente e TEM senha definida, valida ela
      const isValid = await bcrypt.compare(password, user.password);
      
      if (isValid) {
         // Login local bem sucedido
         await createSession({
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name
         });
         return NextResponse.json({ success: true, user });
      } else {
         // Se tem senha local e errou, já rejeita (segurança)
         // A menos que queira fallback para PNQ caso senha local falhe? Não faz sentido.
         return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
      }
    }

    // =================================================================================
    // 2. TENTATIVA DE LOGIN VIA PLAYNAQUADRA (SSO para Atletas)
    // =================================================================================
    // Se não tem usuário local ou não tem senha local definida (usuário importado/SSO)
    
    const playNaQuadraUrl = process.env.PLAYNAQUADRA_API_URL;
    let externalUser = null;

    if (playNaQuadraUrl && !playNaQuadraUrl.includes('playnaquadra.com.br/api')) {
       // Se tivermos uma URL real configurada...
       try {
         const response = await fetch(`${playNaQuadraUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
         });
         
         if (response.ok) {
            const data = await response.json();
            externalUser = data.user || data.usuario;
         }
       } catch (e) {
         console.error("Erro ao conectar PlayNaQuadra", e);
       }
    } else {
       // Mock fallback (para desenvolvimento)
       // Só aceita mock se NÃO for o admin real (que deve usar senha local agora)
       if (password === '123456') {
          externalUser = {
             id: 'mock-pnq-id-' + Math.random().toString(36).substring(7),
             email: email,
             name: email.split('@')[0],
             avatarUrl: null
          };
       }
    }

    if (!externalUser) {
      return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
    }

    // =================================================================================
    // 3. PROVISIONAMENTO / SINCRONIZAÇÃO
    // =================================================================================
    if (!user) {
      // Cria novo usuário localmente (vinda do SSO)
      const [newUser] = await db.insert(users).values({
        name: externalUser.name || externalUser.nome || 'Atleta',
        email: email,
        playnaquadraId: externalUser.id,
        role: 'PLAYER',
        avatarUrl: externalUser.avatarUrl || externalUser.foto || null
      }).returning();
      user = newUser;
    } else {
       // Atualiza ID externo se necessário
       if (!user.playnaquadraId && externalUser.id) {
          await db.update(users).set({ playnaquadraId: externalUser.id }).where(eq(users.id, user.id));
       }
    }

    // Criar Sessão
    await createSession({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    return NextResponse.json({ success: true, user });

  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ message: 'Erro interno do servidor' }, { status: 500 });
  }
}
