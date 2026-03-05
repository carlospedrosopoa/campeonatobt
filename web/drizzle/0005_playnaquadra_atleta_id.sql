ALTER TABLE "usuarios"
ADD COLUMN IF NOT EXISTS "playnaquadra_atleta_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_playnaquadra_atleta_id_uidx"
ON "usuarios" ("playnaquadra_atleta_id")
WHERE "playnaquadra_atleta_id" IS NOT NULL;

