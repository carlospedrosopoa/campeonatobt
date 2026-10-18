-- Operacao ao vivo: aquecimento antes do jogo
-- padrao do torneio (definido na mesa de controle) e o tempo usado em cada jogo (informado no "Comecou")
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "aquecimento_min" integer DEFAULT 5 NOT NULL;
ALTER TABLE "partidas" ADD COLUMN IF NOT EXISTS "aquecimento_min" integer;
