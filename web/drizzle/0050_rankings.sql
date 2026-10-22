-- Rankings: nome, periodo e imagem; atletas participantes e lancamentos de pontos (inicial, manual e, depois, por torneio)
CREATE TABLE IF NOT EXISTS "rankings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "data_inicio" date NOT NULL,
  "data_fim" date NOT NULL,
  "imagem_url" text,
  "criado_por_id" uuid REFERENCES "usuarios"("id"),
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ranking_atletas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ranking_id" uuid NOT NULL REFERENCES "rankings"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "criado_em" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ranking_atletas_ranking_usuario_unq" UNIQUE ("ranking_id", "usuario_id")
);

CREATE TABLE IF NOT EXISTS "ranking_lancamentos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ranking_id" uuid NOT NULL REFERENCES "rankings"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "tipo" text DEFAULT 'MANUAL' NOT NULL,
  "pontos" integer NOT NULL,
  "observacao" text,
  "torneio_id" uuid REFERENCES "torneios"("id") ON DELETE SET NULL,
  "criado_por_id" uuid REFERENCES "usuarios"("id"),
  "criado_em" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ranking_lancamentos_ranking_usuario_idx" ON "ranking_lancamentos" ("ranking_id", "usuario_id");
