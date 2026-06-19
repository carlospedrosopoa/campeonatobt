ALTER TABLE "torneios"
ADD COLUMN IF NOT EXISTS "quadras_ativas" integer DEFAULT 0 NOT NULL;

ALTER TABLE "partidas"
ADD COLUMN IF NOT EXISTS "iniciado_em" timestamp;

ALTER TABLE "partidas"
ADD COLUMN IF NOT EXISTS "finalizado_em" timestamp;
