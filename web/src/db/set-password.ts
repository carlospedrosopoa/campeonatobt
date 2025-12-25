import { db } from './index';
import { users } from './schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function setAdminPassword() {
  const email = 'carlospedrosopoa@gmail.com';
  const password = 'admin'; // Senha local
  
  console.log(`🔒 Definindo senha local para ${email}...`);

  // Hash da senha
  const hashedPassword = await bcrypt.hash(password, 10);

  // Verifica se o usuário existe
  const existingUsers = await db.select().from(users).where(eq(users.email, email));
  
  if (existingUsers.length === 0) {
    console.log('⚠️ Usuário não encontrado. Criando usuário ADMIN com senha...');
    await db.insert(users).values({
      name: 'Carlos Pedroso',
      email: email,
      role: 'ADMIN',
      password: hashedPassword
    });
  } else {
    // Se existe, atualiza senha e garante role admin
    await db.update(users)
      .set({ 
          password: hashedPassword,
          role: 'ADMIN' 
      })
      .where(eq(users.email, email));
  }

  console.log('✅ Senha definida com sucesso! Use "admin" para logar.');
  process.exit(0);
}

setAdminPassword().catch((err) => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
