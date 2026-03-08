import { db } from './index';
import { esportes, usuarios, torneios, categorias } from './schema';
import { eq } from 'drizzle-orm';

function slugify(text: string) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados (Novo Schema PT-BR)...');

  // 1. Criar Esportes
  console.log('🎾 Criando esportes...');
  const esportesList = [
    { nome: 'Beach Tennis', slug: 'beach-tennis' },
    { nome: 'Padel', slug: 'padel' },
    { nome: 'Pickleball', slug: 'pickleball' },
    { nome: 'Vôlei de Praia', slug: 'volei-praia' },
    { nome: 'Futevôlei', slug: 'futevolei' },
  ];

  let beachTennisId;

  for (const esp of esportesList) {
    const existing = await db.select().from(esportes).where(eq(esportes.slug, esp.slug)).limit(1);
    let id;
    if (existing.length > 0) {
      id = existing[0].id;
    } else {
      const [newEsp] = await db.insert(esportes).values({
        nome: esp.nome,
        slug: esp.slug,
      }).returning();
      id = newEsp.id;
    }
    
    if (esp.slug === 'beach-tennis') beachTennisId = id;
    console.log(`   - Esporte: ${esp.nome} (ID: ${id})`);
  }

  // 2. Criar Usuário Organizador Padrão
  console.log('👤 Criando usuário organizador...');
  const orgEmail = 'admin@torneio.com';
  let organizadorId;
  
  const existingUser = await db.select().from(usuarios).where(eq(usuarios.email, orgEmail)).limit(1);
  if (existingUser.length > 0) {
    organizadorId = existingUser[0].id;
    console.log('   - Usuário existente encontrado.');
  } else {
    const [newUser] = await db.insert(usuarios).values({
      nome: 'Administrador do Sistema',
      email: orgEmail,
      perfil: 'ADMIN',
      senha: 'admin', // Senha dummy, em prod usar auth real
    }).returning();
    organizadorId = newUser.id;
    console.log('   - Novo usuário criado.');
  }

  // 3. Criar Torneio
  const tournamentSlug = 'brasileirao-8a-temporada';
  console.log(`🏆 Criando/Verificando torneio: ${tournamentSlug}`);
  
  let tournamentId;
  const existingTournament = await db.select().from(torneios).where(eq(torneios.slug, tournamentSlug)).limit(1);

  if (existingTournament.length > 0) {
    console.log('   - Torneio já existe.');
    tournamentId = existingTournament[0].id;
  } else {
    const [newTournament] = await db.insert(torneios).values({
      nome: 'Brasileirão - 8ª Temporada',
      slug: tournamentSlug,
      descricao: 'O maior torneio de Beach Tennis do ano!',
      dataInicio: '2026-04-15',
      dataFim: '2026-04-17',
      local: 'Arena Beach Club - São Paulo',
      status: 'ABERTO',
      esporteId: beachTennisId,
      organizadorId: organizadorId,
      bannerUrl: 'https://images.unsplash.com/photo-1629252865485-80a563148113?q=80&w=2070&auto=format&fit=crop',
    }).returning();
    tournamentId = newTournament.id;
    console.log('   - Torneio criado com sucesso.');
  }

  // 4. Criar Categorias
  console.log('📋 Criando categorias...');
  const catsToCreate = [
    { nome: 'Masculina B', genero: 'MASCULINO' as const, valor: 120.00 },
    { nome: 'Masculina C', genero: 'MASCULINO' as const, valor: 100.00 },
    { nome: 'Feminina B', genero: 'FEMININO' as const, valor: 120.00 },
    { nome: 'Mista C', genero: 'MISTO' as const, valor: 100.00 },
  ];

  for (const cat of catsToCreate) {
    // Verificar se já existe (simplificado)
    // Para seed, vamos apenas inserir. Em produção idealmente checaríamos.
    // Como é desenvolvimento, vou limpar e recriar ou apenas inserir.
    
    console.log(`   - Inserindo categoria:`, cat);
    await db.insert(categorias).values({
      torneioId: tournamentId,
      nome: cat.nome,
      slug: slugify(cat.nome),
      genero: cat.genero,
      valorInscricao: cat.valor.toString(),
      vagasMaximas: 32,
    });
    console.log(`   - Categoria criada: ${cat.nome}`);
  }

  console.log('✅ Seed concluído com sucesso!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Erro no seed:', err);
  process.exit(1);
});
