ALTER TABLE "torneios"
ADD COLUMN IF NOT EXISTS "card_apenas_com_fotos" boolean DEFAULT false NOT NULL;
