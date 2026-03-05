ALTER TABLE "categorias" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "categorias" SET "slug" = lower(replace("nome", ' ', '-'));--> statement-breakpoint
ALTER TABLE "categorias" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_torneio_id_slug_unique" UNIQUE("torneio_id","slug");