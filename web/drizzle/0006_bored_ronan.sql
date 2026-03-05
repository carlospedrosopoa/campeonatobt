CREATE TABLE "apoiadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"logo_url" text,
	"slogan" text,
	"endereco" text,
	"latitude" text,
	"longitude" text,
	"site_url" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apoiadores" ADD CONSTRAINT "apoiadores_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;