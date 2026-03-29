ALTER TABLE "arenas" ADD COLUMN IF NOT EXISTS "point_id" text;
ALTER TABLE "arenas" ADD COLUMN IF NOT EXISTS "logo_url" text;
CREATE UNIQUE INDEX IF NOT EXISTS "arenas_torneio_point_unique" ON "arenas" ("torneio_id","point_id");
