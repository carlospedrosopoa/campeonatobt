ALTER TABLE "equipes" ADD COLUMN IF NOT EXISTS "capitao_usuario_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipes" ADD CONSTRAINT "equipes_capitao_usuario_id_usuarios_id_fk" FOREIGN KEY ("capitao_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "placar_submissoes" ADD COLUMN IF NOT EXISTS "confirmado_por_usuario_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placar_submissoes" ADD CONSTRAINT "placar_submissoes_confirmado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("confirmado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
