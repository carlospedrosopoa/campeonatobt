-- mata-mata progressivo: posicao do jogo na chave, para liberar cada jogo assim que os dois lados estao definidos
ALTER TABLE "partidas" ADD COLUMN IF NOT EXISTS "posicao_chave" integer;
-- um jogo por posicao em cada fase (evita jogo duplicado quando dois placares fecham ao mesmo tempo)
CREATE UNIQUE INDEX IF NOT EXISTS "partidas_categoria_fase_posicao_chave_uq" ON "partidas" ("categoria_id", "fase", "posicao_chave") WHERE "posicao_chave" IS NOT NULL;
