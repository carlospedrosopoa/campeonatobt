DO $$
BEGIN
  ALTER TYPE "status_panelinha_play_jogo" ADD VALUE IF NOT EXISTS 'REGISTRADO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "status_panelinha_play_jogo" ADD VALUE IF NOT EXISTS 'CONFIRMADO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "panelinha_play_jogos"
SET "status" = 'CONFIRMADO'
WHERE "status" = 'FINALIZADO';
