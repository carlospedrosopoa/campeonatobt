CREATE TYPE "public"."fase_torneio" AS ENUM('GRUPOS', 'OITAVAS', 'QUARTAS', 'SEMI', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."genero_categoria" AS ENUM('MASCULINO', 'FEMININO', 'MISTO');--> statement-breakpoint
CREATE TYPE "public"."perfil_usuario" AS ENUM('ADMIN', 'ORGANIZADOR', 'ATLETA');--> statement-breakpoint
CREATE TYPE "public"."status_inscricao" AS ENUM('PENDENTE', 'APROVADA', 'RECUSADA', 'FILA_ESPERA');--> statement-breakpoint
CREATE TYPE "public"."status_partida" AS ENUM('AGENDADA', 'EM_ANDAMENTO', 'FINALIZADA', 'WO', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."status_torneio" AS ENUM('RASCUNHO', 'ABERTO', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"genero" "genero_categoria" NOT NULL,
	"valor_inscricao" numeric(10, 2) DEFAULT '0',
	"vagas_maximas" integer,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipe_integrantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipe_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text,
	"torneio_id" uuid,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esportes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "esportes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "grupo_equipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"equipe_id" uuid NOT NULL,
	"pontos" integer DEFAULT 0,
	"jogos_jogados" integer DEFAULT 0,
	"jogos_vencidos" integer DEFAULT 0,
	"jogos_perdidos" integer DEFAULT 0,
	"saldo_games" integer DEFAULT 0,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grupos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inscricoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"equipe_id" uuid NOT NULL,
	"status" "status_inscricao" DEFAULT 'PENDENTE' NOT NULL,
	"comprovante_url" text,
	"data_inscricao" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"rodada_id" uuid,
	"grupo_id" uuid,
	"equipe_a_id" uuid NOT NULL,
	"equipe_b_id" uuid NOT NULL,
	"vencedor_id" uuid,
	"placar_a" integer DEFAULT 0,
	"placar_b" integer DEFAULT 0,
	"detalhes_placar" json,
	"status" "status_partida" DEFAULT 'AGENDADA' NOT NULL,
	"fase" "fase_torneio" DEFAULT 'GRUPOS' NOT NULL,
	"quadra" text,
	"data_horario" timestamp,
	"observacoes" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patrocinadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"logo_url" text,
	"site_url" text,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rodadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"categoria_id" uuid,
	"nome" text NOT NULL,
	"numero" integer,
	"data_inicio" timestamp,
	"data_fim" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "torneios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"descricao" text,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"local" text NOT NULL,
	"status" "status_torneio" DEFAULT 'RASCUNHO' NOT NULL,
	"esporte_id" uuid,
	"organizador_id" uuid NOT NULL,
	"banner_url" text,
	"logo_url" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "torneios_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha" text,
	"perfil" "perfil_usuario" DEFAULT 'ATLETA' NOT NULL,
	"foto_url" text,
	"telefone" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe_integrantes" ADD CONSTRAINT "equipe_integrantes_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe_integrantes" ADD CONSTRAINT "equipe_integrantes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipes" ADD CONSTRAINT "equipes_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupo_equipes" ADD CONSTRAINT "grupo_equipes_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupo_equipes" ADD CONSTRAINT "grupo_equipes_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscricoes" ADD CONSTRAINT "inscricoes_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscricoes" ADD CONSTRAINT "inscricoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscricoes" ADD CONSTRAINT "inscricoes_equipe_id_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_rodada_id_rodadas_id_fk" FOREIGN KEY ("rodada_id") REFERENCES "public"."rodadas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_equipe_a_id_equipes_id_fk" FOREIGN KEY ("equipe_a_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_equipe_b_id_equipes_id_fk" FOREIGN KEY ("equipe_b_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_vencedor_id_equipes_id_fk" FOREIGN KEY ("vencedor_id") REFERENCES "public"."equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrocinadores" ADD CONSTRAINT "patrocinadores_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rodadas" ADD CONSTRAINT "rodadas_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rodadas" ADD CONSTRAINT "rodadas_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneios" ADD CONSTRAINT "torneios_esporte_id_esportes_id_fk" FOREIGN KEY ("esporte_id") REFERENCES "public"."esportes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneios" ADD CONSTRAINT "torneios_organizador_id_usuarios_id_fk" FOREIGN KEY ("organizador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;