CREATE TABLE "categoria_configuracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"config" json NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categoria_configuracoes_categoria_id_unique" UNIQUE("categoria_id")
);
--> statement-breakpoint
ALTER TABLE "categoria_configuracoes" ADD CONSTRAINT "categoria_configuracoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;