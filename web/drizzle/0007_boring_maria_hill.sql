CREATE TABLE IF NOT EXISTS "inscricao_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL REFERENCES "public"."inscricoes"("id") ON DELETE cascade ON UPDATE no action,
	"usuario_id" uuid NOT NULL REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action,
	"pago" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inscricao_pagamentos_inscricao_id_usuario_id_unique" UNIQUE("inscricao_id","usuario_id")
);
--> statement-breakpoint
INSERT INTO "inscricao_pagamentos" ("inscricao_id", "usuario_id", "pago")
SELECT "inscricoes"."id", "equipe_integrantes"."usuario_id", false
FROM "inscricoes"
INNER JOIN "equipes" ON "equipes"."id" = "inscricoes"."equipe_id"
INNER JOIN "equipe_integrantes" ON "equipe_integrantes"."equipe_id" = "equipes"."id"
ON CONFLICT ("inscricao_id","usuario_id") DO NOTHING;
