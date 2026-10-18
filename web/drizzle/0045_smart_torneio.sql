-- Smart Torneio: torneio privado criado pelo atleta no app, pago por Pix e autorizado pelo Play na Quadra
CREATE TABLE IF NOT EXISTS "smart_torneios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "torneio_id" uuid NOT NULL UNIQUE REFERENCES "torneios"("id") ON DELETE CASCADE,
  "categoria_id" uuid REFERENCES "categorias"("id") ON DELETE SET NULL,
  "criador_usuario_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "codigo" text NOT NULL UNIQUE,
  -- AGUARDANDO_PAGAMENTO | AGUARDANDO_APROVACAO | APROVADO | RECUSADO
  "status" text DEFAULT 'AGUARDANDO_PAGAMENTO' NOT NULL,
  "quantidade_atletas" integer NOT NULL,
  "valor" numeric(10, 2) NOT NULL,
  "pix_copia_cola" text,
  "pagamento_informado_em" timestamp,
  "aprovado_em" timestamp,
  "aprovado_por_id" uuid REFERENCES "usuarios"("id"),
  "motivo_recusa" text,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "smart_torneios_criador_idx" ON "smart_torneios" ("criador_usuario_id");
CREATE INDEX IF NOT EXISTS "smart_torneios_status_idx" ON "smart_torneios" ("status");

-- configuracao unica (linha id = 1): preco e Pix do Play na Quadra
CREATE TABLE IF NOT EXISTS "smart_torneio_config" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "valor_por_atleta" numeric(10, 2) DEFAULT 5 NOT NULL,
  "valor_minimo" numeric(10, 2) DEFAULT 40 NOT NULL,
  "pix_chave" text,
  "pix_nome" text,
  "pix_cidade" text,
  "atualizado_em" timestamp DEFAULT now() NOT NULL
);
INSERT INTO "smart_torneio_config" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
