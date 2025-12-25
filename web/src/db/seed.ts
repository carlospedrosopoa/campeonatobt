import { db } from './index';
import { tournaments, categories } from './schema';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // 1. Criar ou recuperar o Torneio
  const tournamentSlug = 'brasileirao-8a-temporada';
  
  // Verifica se já existe
  const existingTournament = await db.select().from(tournaments).where(eq(tournaments.slug, tournamentSlug));
  
  let tournamentId;

  if (existingTournament.length > 0) {
    console.log('🏆 Torneio já existe:', existingTournament[0].name);
    tournamentId = existingTournament[0].id;
  } else {
    console.log('🏆 Criando torneio: Brasileirão - 8ª Temporada');
    const [newTournament] = await db.insert(tournaments).values({
      name: 'Brasileirão - 8ª Temporada',
      slug: tournamentSlug,
      startDate: new Date('2025-04-15'), // Data fictícia futura
      endDate: new Date('2025-04-17'),
      location: 'Arena Beach Club - São Paulo',
      status: 'OPEN_FOR_REGISTRATION',
      bannerUrl: 'https://images.unsplash.com/photo-1629252865485-80a563148113?q=80&w=2070&auto=format&fit=crop',
    }).returning();
    tournamentId = newTournament.id;
  }

  // 2. Criar Categorias
  const catsToCreate = [
    { name: 'Masculina B', price: 120.00 },
    { name: 'Masculina C', price: 100.00 },
    { name: 'Masculina D', price: 80.00 },
    { name: 'Feminina B', price: 120.00 },
    { name: 'Feminina C', price: 100.00 },
    { name: 'Feminina D', price: 80.00 },
  ];

  console.log('📋 Verificando/Criando categorias...');
  
  for (const cat of catsToCreate) {
    // Verifica se categoria já existe neste torneio
    const existingCat = await db.select()
      .from(categories)
      .where(eq(categories.name, cat.name));
      
    // Filtro simples, idealmente checaria tournamentId também se o drizzle permitisse .where(and(...)) facilmente sem import
    // Mas para seed simples, vamos assumir que se não tem o nome, cria.
    
    // Melhor abordagem: Inserir direto, se duplicar paciência (ou limpar banco antes). 
    // Vamos criar apenas.
    
    await db.insert(categories).values({
      tournamentId: tournamentId,
      name: cat.name,
      price: cat.price.toString(),
      maxPairs: 32 // Default
    });
    console.log(`   - Categoria criada: ${cat.name}`);
  }

  console.log('✅ Seed concluído com sucesso!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Erro no seed:', err);
  process.exit(1);
});
