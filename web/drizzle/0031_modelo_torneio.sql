DO $$ BEGIN
 CREATE TYPE "public"."modelo_torneio" AS ENUM('NORMAL', 'SUPERCAMPEONATO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "modelo_torneio" "modelo_torneio";
