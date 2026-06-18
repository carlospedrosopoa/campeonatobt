CREATE TABLE IF NOT EXISTS "panelinha_ranking_jogos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "temporada_id" uuid NOT NULL,
  "play_id" uuid NOT NULL,
  "jogo_id" uuid NOT NULL,
  "atleta_id" uuid NOT NULL,
  "semana_key" text NOT NULL,
  "pontuacao" numeric(10,2) DEFAULT 0 NOT NULL,
  "vitoria" boolean DEFAULT false NOT NULL,
  "vitoria_tie_break" boolean DEFAULT false NOT NULL,
  "derrota_tie_break" boolean DEFAULT false NOT NULL,
  "games_feitos" integer DEFAULT 0 NOT NULL,
  "games_sofridos" integer DEFAULT 0 NOT NULL,
  "saldo_games" integer DEFAULT 0 NOT NULL,
  "ocorreu_em" timestamp NOT NULL,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "panelinha_ranking_plays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "temporada_id" uuid NOT NULL,
  "play_id" uuid NOT NULL,
  "atleta_id" uuid NOT NULL,
  "semana_key" text NOT NULL,
  "pontuacao" integer DEFAULT 0 NOT NULL,
  "jogos" integer DEFAULT 0 NOT NULL,
  "vitorias" integer DEFAULT 0 NOT NULL,
  "saldo_games" integer DEFAULT 0 NOT NULL,
  "primeiro_jogo_em" timestamp NOT NULL,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "panelinha_ranking_semanas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "temporada_id" uuid NOT NULL,
  "atleta_id" uuid NOT NULL,
  "semana_key" text NOT NULL,
  "pontuacao_semana" numeric(10,2) DEFAULT 0 NOT NULL,
  "best_play_id" uuid,
  "qtd_plays_semana" integer DEFAULT 0 NOT NULL,
  "vitorias_semana" integer DEFAULT 0 NOT NULL,
  "saldo_games_semana" integer DEFAULT 0 NOT NULL,
  "primeiro_play_em" timestamp NOT NULL,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "panelinha_ranking_temporadas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "panelinha_id" uuid NOT NULL,
  "temporada_id" uuid NOT NULL,
  "atleta_id" uuid NOT NULL,
  "pontuacao_total" numeric(10,2) DEFAULT 0 NOT NULL,
  "semanas_pontuadas" integer DEFAULT 0 NOT NULL,
  "qtd_plays_total" integer DEFAULT 0 NOT NULL,
  "vitorias_total" integer DEFAULT 0 NOT NULL,
  "saldo_games_total" integer DEFAULT 0 NOT NULL,
  "primeiro_play_em" timestamp NOT NULL,
  "posicao" integer,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_jogos"
    ADD CONSTRAINT "panelinha_ranking_jogos_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_jogos"
    ADD CONSTRAINT "panelinha_ranking_jogos_temporada_id_panelinha_temporadas_id_fk"
    FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_jogos"
    ADD CONSTRAINT "panelinha_ranking_jogos_play_id_panelinha_plays_id_fk"
    FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_jogos"
    ADD CONSTRAINT "panelinha_ranking_jogos_jogo_id_panelinha_play_jogos_id_fk"
    FOREIGN KEY ("jogo_id") REFERENCES "public"."panelinha_play_jogos"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_jogos"
    ADD CONSTRAINT "panelinha_ranking_jogos_atleta_id_usuarios_id_fk"
    FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_plays"
    ADD CONSTRAINT "panelinha_ranking_plays_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_plays"
    ADD CONSTRAINT "panelinha_ranking_plays_temporada_id_panelinha_temporadas_id_fk"
    FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_plays"
    ADD CONSTRAINT "panelinha_ranking_plays_play_id_panelinha_plays_id_fk"
    FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_plays"
    ADD CONSTRAINT "panelinha_ranking_plays_atleta_id_usuarios_id_fk"
    FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_semanas"
    ADD CONSTRAINT "panelinha_ranking_semanas_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_semanas"
    ADD CONSTRAINT "panelinha_ranking_semanas_temporada_id_panelinha_temporadas_id_fk"
    FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_semanas"
    ADD CONSTRAINT "panelinha_ranking_semanas_atleta_id_usuarios_id_fk"
    FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_semanas"
    ADD CONSTRAINT "panelinha_ranking_semanas_best_play_id_panelinha_plays_id_fk"
    FOREIGN KEY ("best_play_id") REFERENCES "public"."panelinha_plays"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_temporadas"
    ADD CONSTRAINT "panelinha_ranking_temporadas_panelinha_id_panelinhas_id_fk"
    FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_temporadas"
    ADD CONSTRAINT "panelinha_ranking_temporadas_temporada_id_panelinha_temporadas_id_fk"
    FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "panelinha_ranking_temporadas"
    ADD CONSTRAINT "panelinha_ranking_temporadas_atleta_id_usuarios_id_fk"
    FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_ranking_jogos_jogo_id_atleta_id_unq"
  ON "panelinha_ranking_jogos" ("jogo_id", "atleta_id");

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_ranking_plays_play_id_atleta_id_unq"
  ON "panelinha_ranking_plays" ("play_id", "atleta_id");

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_ranking_semanas_temporada_id_atleta_id_semana_key_unq"
  ON "panelinha_ranking_semanas" ("temporada_id", "atleta_id", "semana_key");

CREATE UNIQUE INDEX IF NOT EXISTS "panelinha_ranking_temporadas_temporada_id_atleta_id_unq"
  ON "panelinha_ranking_temporadas" ("temporada_id", "atleta_id");
