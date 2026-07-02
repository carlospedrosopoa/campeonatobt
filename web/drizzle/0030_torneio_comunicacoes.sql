DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_comunicacao_whatsapp') THEN
    CREATE TYPE "public"."status_comunicacao_whatsapp" AS ENUM('PENDENTE', 'ENVIADO', 'FALHA', 'SEM_TELEFONE', 'NAO_ENVIADO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "torneio_comunicacoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "torneio_id" uuid NOT NULL,
  "categoria_id" uuid,
  "criado_por_id" uuid NOT NULL,
  "titulo" text,
  "mensagem" text NOT NULL,
  "enviar_whatsapp" boolean DEFAULT true NOT NULL,
  "publicar_no_app" boolean DEFAULT true NOT NULL,
  "total_destinatarios" integer DEFAULT 0 NOT NULL,
  "total_whatsapp_enviados" integer DEFAULT 0 NOT NULL,
  "total_whatsapp_falhas" integer DEFAULT 0 NOT NULL,
  "total_whatsapp_sem_telefone" integer DEFAULT 0 NOT NULL,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "torneio_comunicacoes_torneio_id_torneios_id_fk"
    FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "torneio_comunicacoes_categoria_id_categorias_id_fk"
    FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "torneio_comunicacoes_criado_por_id_usuarios_id_fk"
    FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "torneio_comunicacao_destinatarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comunicacao_id" uuid NOT NULL,
  "torneio_id" uuid NOT NULL,
  "usuario_id" uuid NOT NULL,
  "telefone" text,
  "whatsapp_status" "status_comunicacao_whatsapp" DEFAULT 'PENDENTE' NOT NULL,
  "whatsapp_enviado_em" timestamp,
  "whatsapp_erro" text,
  "lida_em" timestamp,
  "criado_em" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "torneio_comunicacao_destinatarios_comunicacao_id_usuario_id_unique" UNIQUE("comunicacao_id", "usuario_id"),
  CONSTRAINT "torneio_comunicacao_destinatarios_comunicacao_id_torneio_comunicacoes_id_fk"
    FOREIGN KEY ("comunicacao_id") REFERENCES "public"."torneio_comunicacoes"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "torneio_comunicacao_destinatarios_torneio_id_torneios_id_fk"
    FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "torneio_comunicacao_destinatarios_usuario_id_usuarios_id_fk"
    FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action
);
