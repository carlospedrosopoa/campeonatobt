-- Confirmacao de presenca (Fase 1): check-in diario por atleta + chamada de jogo com tolerancia.
CREATE TABLE IF NOT EXISTS "presencas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "torneio_id" uuid NOT NULL REFERENCES "torneios"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "data" date NOT NULL,
  "status" text NOT NULL DEFAULT 'PRESENTE',
  "origem" text NOT NULL,
  "registrado_por" uuid REFERENCES "usuarios"("id"),
  "registrado_em" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "presencas_torneio_usuario_data_unique" UNIQUE ("torneio_id", "usuario_id", "data")
);
CREATE INDEX IF NOT EXISTS "presencas_torneio_data_idx" ON "presencas" ("torneio_id", "data");

ALTER TABLE "partidas" ADD COLUMN IF NOT EXISTS "chamado_em" timestamp;
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "tolerancia_atraso_min" integer NOT NULL DEFAULT 15;
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "checkin_modo" text NOT NULL DEFAULT 'AMBOS';
