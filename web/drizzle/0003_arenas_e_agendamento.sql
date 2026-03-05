CREATE TABLE "arenas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arenas" ADD CONSTRAINT "arenas_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN IF NOT EXISTS "arena_id" uuid;
--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN IF NOT EXISTS "data_limite" timestamp;
--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_arena_id_arenas_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arenas"("id") ON DELETE no action ON UPDATE no action;

