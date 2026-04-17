CREATE TYPE "public"."status_placar_submissao" AS ENUM('PENDENTE', 'CONFIRMADA', 'CANCELADA');--> statement-breakpoint
CREATE TABLE "gzappy_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"api_key" text,
	"instance_id" text,
	"whatsapp_arbitragem" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placar_submissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partida_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"status" "status_placar_submissao" DEFAULT 'PENDENTE' NOT NULL,
	"detalhes_placar" json NOT NULL,
	"placar_a" integer NOT NULL,
	"placar_b" integer NOT NULL,
	"vencedor_id" uuid,
	"token_hash" text NOT NULL,
	"token_expira_em" timestamp,
	"confirmado_em" timestamp,
	"cancelado_em" timestamp,
	"cancelado_motivo" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "placar_submissoes" ADD CONSTRAINT "placar_submissoes_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placar_submissoes" ADD CONSTRAINT "placar_submissoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placar_submissoes" ADD CONSTRAINT "placar_submissoes_vencedor_id_equipes_id_fk" FOREIGN KEY ("vencedor_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;

