DO $$
BEGIN
  CREATE TYPE "status_panelinha_temporada" AS ENUM('ABERTA', 'ENCERRADA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "panelinha_temporadas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "inicio_em" timestamp NOT NULL,
  "fim_em" timestamp,
  "status" "status_panelinha_temporada" DEFAULT 'ABERTA' NOT NULL,
  "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
  "campeao_atleta_id" uuid,
  "encerrada_em" timestamp,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "panelinha_temporadas"
    ADD CONSTRAINT "panelinha_temporadas_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_temporadas"
    ADD CONSTRAINT "panelinha_temporadas_campeao_atleta_id_usuarios_id_fk"
    FOREIGN KEY ("campeao_atleta_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "panelinha_temporadas_panelinha_id_idx"
  ON "panelinha_temporadas" ("panelinha_id");

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_temporadas_aberta_unq"
  ON "panelinha_temporadas" ("panelinha_id")
  WHERE "status" = 'ABERTA';
