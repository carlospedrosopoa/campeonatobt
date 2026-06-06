ALTER TABLE "torneios"
ADD COLUMN IF NOT EXISTS "inscricao_com_ia" boolean DEFAULT false NOT NULL;
