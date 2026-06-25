CREATE TABLE IF NOT EXISTS "torneio_administradores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "torneio_id" uuid NOT NULL REFERENCES "torneios"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "torneio_administradores_torneio_id_usuario_id_unique" UNIQUE("torneio_id", "usuario_id")
);
