-- Smart Torneio de teste: nao envia comunicacoes (app nem WhatsApp) e pode ser excluido mesmo com jogos
ALTER TABLE "smart_torneios" ADD COLUMN IF NOT EXISTS "teste" boolean DEFAULT false NOT NULL;
