-- arena sede do torneio: Point do Play na Quadra que ve o torneio e gera as comandas das inscricoes
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "point_id_sede" text;
CREATE INDEX IF NOT EXISTS "torneios_point_id_sede_idx" ON "torneios" ("point_id_sede") WHERE "point_id_sede" IS NOT NULL;
