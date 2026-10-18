-- Operacao ao vivo: chamada automatica do proximo jogo quando a quadra libera (flag da mesa de controle)
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "chamada_automatica" boolean DEFAULT false NOT NULL;
-- Smart Torneio (criado na hora, todos no local) ja nasce com a chamada automatica
UPDATE "torneios" SET "chamada_automatica" = true WHERE "id" IN (SELECT "torneio_id" FROM "smart_torneios");
