DO $$
BEGIN
  CREATE TYPE "status_panelinha" AS ENUM('ATIVA', 'INATIVA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "papel_panelinha_membro" AS ENUM('FUNDADOR', 'MEMBRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "status_panelinha_membro" AS ENUM('ATIVO', 'INATIVO', 'REMOVIDO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "status_panelinha_convite" AS ENUM('PENDENTE', 'ACEITO', 'RECUSADO', 'CANCELADO', 'EXPIRADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "panelinhas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "status" "status_panelinha" DEFAULT 'ATIVA' NOT NULL,
  "fundador_id" uuid NOT NULL,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "panelinha_membros" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "atleta_id" uuid NOT NULL,
  "papel" "papel_panelinha_membro" DEFAULT 'MEMBRO' NOT NULL,
  "status" "status_panelinha_membro" DEFAULT 'ATIVO' NOT NULL,
  "convidado_por_id" uuid,
  "entrou_em" timestamp DEFAULT now() NOT NULL,
  "saiu_em" timestamp,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "panelinha_convites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "convidado_id" uuid NOT NULL,
  "convidado_por_id" uuid NOT NULL,
  "status" "status_panelinha_convite" DEFAULT 'PENDENTE' NOT NULL,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "respondido_em" timestamp,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "panelinhas"
    ADD CONSTRAINT "panelinhas_fundador_id_usuarios_id_fk"
    FOREIGN KEY ("fundador_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_membros"
    ADD CONSTRAINT "panelinha_membros_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_membros"
    ADD CONSTRAINT "panelinha_membros_atleta_id_usuarios_id_fk"
    FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_membros"
    ADD CONSTRAINT "panelinha_membros_convidado_por_id_usuarios_id_fk"
    FOREIGN KEY ("convidado_por_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_convites"
    ADD CONSTRAINT "panelinha_convites_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_convites"
    ADD CONSTRAINT "panelinha_convites_convidado_id_usuarios_id_fk"
    FOREIGN KEY ("convidado_id") REFERENCES "public"."usuarios"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_convites"
    ADD CONSTRAINT "panelinha_convites_convidado_por_id_usuarios_id_fk"
    FOREIGN KEY ("convidado_por_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_membros_panelinha_id_atleta_id_unq"
  ON "panelinha_membros" ("panelinha_id", "atleta_id");

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_convites_pendente_unq"
  ON "panelinha_convites" ("panelinha_id", "convidado_id")
  WHERE "status" = 'PENDENTE';
