DO $$ BEGIN
  CREATE TYPE "tipo_card_inscricao" AS ENUM ('TIPO_1', 'TIPO_2');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "categorias"
ADD COLUMN IF NOT EXISTS "tipo_card_inscricao" "tipo_card_inscricao" DEFAULT 'TIPO_1' NOT NULL;
