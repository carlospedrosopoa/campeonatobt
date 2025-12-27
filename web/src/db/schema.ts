import { pgTable, serial, text, timestamp, boolean, uuid, integer, decimal, json } from 'drizzle-orm/pg-core';

// Enums simulados como consts para simplicidade inicial, ou podemos usar pgEnum se o banco suportar
export const userRoles = ['ADMIN', 'ORGANIZER', 'PLAYER'] as const;
export const tournamentStatus = ['DRAFT', 'OPEN_FOR_REGISTRATION', 'ONGOING', 'FINISHED'] as const;
export const matchStatus = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'WALKOVER'] as const;
export const matchPhase = ['GROUP', 'ROUND_OF_64', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'] as const;

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password'), // Senha local (para admins/organizadores)
  playnaquadraId: text('playnaquadra_id').unique(), // ID externo do PlayNaQuadra
  role: text('role', { enum: userRoles }).default('PLAYER').notNull(),
  avatarUrl: text('avatar_url'),
  points: integer('points').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tournaments = pgTable('tournaments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  location: text('location').notNull(),
  status: text('status', { enum: tournamentStatus }).default('DRAFT').notNull(),
  bannerUrl: text('banner_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  tournamentId: uuid('tournament_id').references(() => tournaments.id).notNull(),
  name: text('name').notNull(), // Ex: "Masculina B", "Mista C"
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  maxPairs: integer('max_pairs'), // Limite de duplas
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const registrations = pgTable('registrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  player1Id: uuid('player1_id').references(() => users.id).notNull(),
  player2Id: uuid('player2_id').references(() => users.id), // Opcional para categorias individuais (se houver)
  status: text('status', { enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAID'] }).default('PENDING').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sponsors = pgTable('sponsors', {
  id: uuid('id').defaultRandom().primaryKey(),
  tournamentId: uuid('tournament_id').references(() => tournaments.id).notNull(),
  name: text('name').notNull(),
  address: text('address'),
  instagram: text('instagram'),
  website: text('website'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const groups = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  name: text('name').notNull(), // "Grupo A", "Grupo B"
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Tabela de relacionamento para saber qual time está em qual grupo
// Pode ser redundante se o match já tiver group_id, mas ajuda na visualização da tabela de classificação
export const groupTeams = pgTable('group_teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').references(() => groups.id).notNull(),
  registrationId: uuid('registration_id').references(() => registrations.id).notNull(),
  points: integer('points').default(0),
  gamesPlayed: integer('games_played').default(0),
  gamesWon: integer('games_won').default(0),
  gamesLost: integer('games_lost').default(0),
  setsWon: integer('sets_won').default(0),
  setsLost: integer('sets_lost').default(0),
  gamesBalance: integer('games_balance').default(0), // Saldo de games
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const matches = pgTable('matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  tournamentId: uuid('tournament_id').references(() => tournaments.id).notNull(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  groupId: uuid('group_id').references(() => groups.id), // Null se for mata-mata
  team1Id: uuid('team1_id').references(() => registrations.id).notNull(),
  team2Id: uuid('team2_id').references(() => registrations.id).notNull(),
  winnerId: uuid('winner_id').references(() => registrations.id),
  
  // Placar: [{set: 1, team1: 6, team2: 4}, {set: 2, team1: 6, team2: 2}]
  score: json('score').$type<{ set: number; team1: number; team2: number; tiebreak?: boolean }[]>(),
  
  status: text('status', { enum: matchStatus }).default('SCHEDULED').notNull(),
  phase: text('phase', { enum: matchPhase }).default('GROUP').notNull(),
  
  court: text('court'), // Quadra
  scheduledTime: timestamp('scheduled_time'),
  round: integer('round'), // Rodada (1, 2, 3...)
  playnaquadraBookingId: text('playnaquadra_booking_id'), // ID do agendamento externo
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const rounds = pgTable('rounds', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  roundNumber: integer('round_number').notNull(),
  deadline: timestamp('deadline'), // Data limite da rodada
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
