ALTER TABLE "panelinha_ranking_jogos"
  ALTER COLUMN "pontuacao" TYPE integer
  USING round("pontuacao")::integer;

ALTER TABLE "panelinha_ranking_jogos"
  ALTER COLUMN "pontuacao" SET DEFAULT 0;

ALTER TABLE "panelinha_ranking_plays"
  ALTER COLUMN "pontuacao" TYPE numeric(10,2)
  USING "pontuacao"::numeric(10,2);

ALTER TABLE "panelinha_ranking_plays"
  ALTER COLUMN "pontuacao" SET DEFAULT 0;
