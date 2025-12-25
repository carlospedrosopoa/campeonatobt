import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';

// Carrega variáveis de ambiente se não estiverem carregadas
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

// Disable prefetch as it is not supported for "Transaction" pool mode 
export const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
