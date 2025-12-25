import { db } from './index';
import { users } from './schema';
import { eq } from 'drizzle-orm';

async function promoteToAdmin() {
  const email = 'carlospedrosopoa@gmail.com';
  console.log(`👑 Promovendo ${email} para ADMIN...`);

  // Verifica se o usuário existe
  const existingUsers = await db.select().from(users).where(eq(users.email, email));
  
  if (existingUsers.length === 0) {
    console.log('⚠️ Usuário não encontrado. Criando usuário ADMIN...');
    // Se não existe, cria já como admin
    await db.insert(users).values({
      name: 'Carlos Pedroso',
      email: email,
      role: 'ADMIN',
      // playnaquadraId opcional
    });
  } else {
    // Se existe, atualiza
    await db.update(users)
      .set({ role: 'ADMIN' })
      .where(eq(users.email, email));
  }

  console.log('✅ Usuário promovido com sucesso!');
  process.exit(0);
}

promoteToAdmin().catch((err) => {
  console.error('❌ Erro ao promover usuário:', err);
  process.exit(1);
});
