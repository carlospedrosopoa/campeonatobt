DO $$
BEGIN
  CREATE TYPE "status_panelinha_play" AS ENUM('RASCUNHO', 'ABERTO', 'FINALIZADO', 'CANCELADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "formato_panelinha_play" AS ENUM('SUPER4', 'CONFRONTO_LIVRE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "status_panelinha_play_participante" AS ENUM('ATIVO', 'REMOVIDO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "status_panelinha_play_jogo" AS ENUM('PENDENTE', 'FINALIZADO', 'CANCELADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "panelinha_plays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "organizador_id" uuid NOT NULL,
  "agendamento_id" text NOT NULL,
  "data_horario" timestamp NOT NULL,
  "quadra" text,
  "arena_nome" text,
  "status" "status_panelinha_play" DEFAULT 'RASCUNHO' NOT NULL,
  "formato" "formato_panelinha_play" NOT NULL,
  "config" json,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "panelinha_play_participantes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "play_id" uuid NOT NULL,
  "atleta_id" uuid NOT NULL,
  "status" "status_panelinha_play_participante" DEFAULT 'ATIVO' NOT NULL,
  "entrou_em" timestamp DEFAULT now() NOT NULL,
  "saiu_em" timestamp,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "panelinha_play_jogos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "play_id" uuid NOT NULL,
  "ordem" integer NOT NULL,
  "dupla_a_atleta1_id" uuid NOT NULL,
  "dupla_a_atleta2_id" uuid NOT NULL,
  "dupla_b_atleta1_id" uuid NOT NULL,
  "dupla_b_atleta2_id" uuid NOT NULL,
  "status" "status_panelinha_play_jogo" DEFAULT 'PENDENTE' NOT NULL,
  "detalhes_placar" json,
  "registrado_por_id" uuid,
  "registrado_em" timestamp,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "panelinha_plays"
    ADD CONSTRAINT "panelinha_plays_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_plays"
    ADD CONSTRAINT "panelinha_plays_organizador_id_usuarios_id_fk"
    FOREIGN KEY ("organizador_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_participantes"
    ADD CONSTRAINT "panelinha_play_participantes_play_id_panelinha_plays_id_fk"
    FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_participantes"
    ADD CONSTRAINT "panelinha_play_participantes_atleta_id_usuarios_id_fk"
    FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_jogos"
    ADD CONSTRAINT "panelinha_play_jogos_play_id_panelinha_plays_id_fk"
    FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_jogos"
    ADD CONSTRAINT "panelinha_play_jogos_dupla_a_atleta1_id_usuarios_id_fk"
    FOREIGN KEY ("dupla_a_atleta1_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_jogos"
    ADD CONSTRAINT "panelinha_play_jogos_dupla_a_atleta2_id_usuarios_id_fk"
    FOREIGN KEY ("dupla_a_atleta2_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_jogos"
    ADD CONSTRAINT "panelinha_play_jogos_dupla_b_atleta1_id_usuarios_id_fk"
    FOREIGN KEY ("dupla_b_atleta1_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_jogos"
    ADD CONSTRAINT "panelinha_play_jogos_dupla_b_atleta2_id_usuarios_id_fk"
    FOREIGN KEY ("dupla_b_atleta2_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_play_jogos"
    ADD CONSTRAINT "panelinha_play_jogos_registrado_por_id_usuarios_id_fk"
    FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_play_participantes_play_id_atleta_id_unq"
  ON "panelinha_play_participantes" ("play_id", "atleta_id");

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_play_jogos_play_id_ordem_unq"
  ON "panelinha_play_jogos" ("play_id", "ordem");
