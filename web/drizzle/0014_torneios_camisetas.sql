ALTER TABLE "torneios" ADD COLUMN "camiseta_opcoes" json;

CREATE TABLE "torneio_atleta_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"camiseta_opcao" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "torneio_atleta_prefs_unq" UNIQUE("torneio_id","usuario_id")
);

ALTER TABLE "torneio_atleta_prefs" ADD CONSTRAINT "torneio_atleta_prefs_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "torneio_atleta_prefs" ADD CONSTRAINT "torneio_atleta_prefs_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;

