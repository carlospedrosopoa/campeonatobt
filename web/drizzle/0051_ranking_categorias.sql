-- Ranking com categorias: cada categoria tem classificacao propria (permanente = todos os pontos;
-- entrada = pontos dos ultimos N meses, pela data de referencia do lancamento).
-- O periodo (data_inicio/data_fim) deixa de ser usado e da lugar a janela_meses; as colunas ficam opcionais.

-- atleta de teste incluido antes das categorias (autorizado pelo usuario)
DELETE FROM "ranking_lancamentos";
DELETE FROM "ranking_atletas";

ALTER TABLE "rankings" ADD COLUMN IF NOT EXISTS "janela_meses" integer DEFAULT 12 NOT NULL;
ALTER TABLE "rankings" ALTER COLUMN "data_inicio" DROP NOT NULL;
ALTER TABLE "rankings" ALTER COLUMN "data_fim" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "ranking_categorias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ranking_id" uuid NOT NULL REFERENCES "rankings"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "genero" text,
  "ordem" integer DEFAULT 0 NOT NULL,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ranking_categorias_ranking_nome_unq" UNIQUE ("ranking_id", "nome")
);

ALTER TABLE "ranking_atletas" DROP CONSTRAINT IF EXISTS "ranking_atletas_ranking_usuario_unq";
ALTER TABLE "ranking_atletas" ADD COLUMN IF NOT EXISTS "categoria_id" uuid NOT NULL REFERENCES "ranking_categorias"("id") ON DELETE CASCADE;
ALTER TABLE "ranking_atletas" ADD CONSTRAINT "ranking_atletas_categoria_usuario_unq" UNIQUE ("categoria_id", "usuario_id");

ALTER TABLE "ranking_lancamentos" ADD COLUMN IF NOT EXISTS "categoria_id" uuid NOT NULL REFERENCES "ranking_categorias"("id") ON DELETE CASCADE;
ALTER TABLE "ranking_lancamentos" ADD COLUMN IF NOT EXISTS "data_referencia" date DEFAULT CURRENT_DATE NOT NULL;
DROP INDEX IF EXISTS "ranking_lancamentos_ranking_usuario_idx";
CREATE INDEX IF NOT EXISTS "ranking_lancamentos_categoria_usuario_idx" ON "ranking_lancamentos" ("categoria_id", "usuario_id");
