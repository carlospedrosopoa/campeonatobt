import { pgTable, serial, text, timestamp, boolean, uuid, integer, decimal, json } from 'drizzle-orm/pg-core';

// Enums simulados como consts para simplicidade inicial, ou podemos usar pgEnum se o banco suportar
export const userRoles = ['ADMIN', 'ORGANIZER', 'PLAYER'] as const;
export const tournamentStatus = ['DRAFT', 'OPEN_FOR_REGISTRATION', 'ONGOING', 'FINISHED'] as const;

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
