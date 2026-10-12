-- Flag por competicao: capitaes agendam o jogo e informam/confirmam o placar pelo app
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "capitaes_gerenciam_jogos" boolean DEFAULT false NOT NULL;
-- Mantem o recurso ligado nos supercampeonatos, onde ja era usado
UPDATE "torneios" SET "capitaes_gerenciam_jogos" = true WHERE "super_campeonato" = true;
