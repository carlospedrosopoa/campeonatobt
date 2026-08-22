CREATE TYPE "public"."formato_panelinha_play" AS ENUM('SUPER4', 'CONFRONTO_LIVRE');--> statement-breakpoint
CREATE TYPE "public"."modelo_torneio" AS ENUM('NORMAL', 'SUPERCAMPEONATO');--> statement-breakpoint
CREATE TYPE "public"."papel_panelinha_membro" AS ENUM('FUNDADOR', 'MEMBRO');--> statement-breakpoint
CREATE TYPE "public"."status_comunicacao_whatsapp" AS ENUM('PENDENTE', 'ENVIADO', 'FALHA', 'SEM_TELEFONE', 'NAO_ENVIADO');--> statement-breakpoint
CREATE TYPE "public"."status_panelinha_convite" AS ENUM('PENDENTE', 'ACEITO', 'RECUSADO', 'CANCELADO', 'EXPIRADO');--> statement-breakpoint
CREATE TYPE "public"."status_panelinha" AS ENUM('ATIVA', 'INATIVA');--> statement-breakpoint
CREATE TYPE "public"."status_panelinha_membro" AS ENUM('ATIVO', 'INATIVO', 'REMOVIDO');--> statement-breakpoint
CREATE TYPE "public"."status_panelinha_play" AS ENUM('RASCUNHO', 'ABERTO', 'FINALIZADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."status_panelinha_play_jogo" AS ENUM('PENDENTE', 'REGISTRADO', 'CONFIRMADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."status_panelinha_play_participante" AS ENUM('ATIVO', 'REMOVIDO');--> statement-breakpoint
CREATE TYPE "public"."status_panelinha_temporada" AS ENUM('ABERTA', 'ENCERRADA');--> statement-breakpoint
CREATE TYPE "public"."super_campeonato_formato" AS ENUM('2_SET_SUPER_TIE', '1_SET');--> statement-breakpoint
ALTER TYPE "public"."fase_torneio" ADD VALUE 'TERCEIRO_LUGAR';--> statement-breakpoint
CREATE TABLE "panelinha_convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"convidado_id" uuid NOT NULL,
	"convidado_por_id" uuid NOT NULL,
	"status" "status_panelinha_convite" DEFAULT 'PENDENTE' NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"respondido_em" timestamp,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panelinha_membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"atleta_id" uuid NOT NULL,
	"papel" "papel_panelinha_membro" DEFAULT 'MEMBRO' NOT NULL,
	"status" "status_panelinha_membro" DEFAULT 'ATIVO' NOT NULL,
	"convidado_por_id" uuid,
	"entrou_em" timestamp DEFAULT now() NOT NULL,
	"saiu_em" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panelinha_membros_panelinha_id_atleta_id_unique" UNIQUE("panelinha_id","atleta_id")
);
--> statement-breakpoint
CREATE TABLE "panelinha_play_jogos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"play_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"dupla_a_atleta1_id" uuid NOT NULL,
	"dupla_a_atleta2_id" uuid NOT NULL,
	"dupla_b_atleta1_id" uuid NOT NULL,
	"dupla_b_atleta2_id" uuid NOT NULL,
	"status" "status_panelinha_play_jogo" DEFAULT 'PENDENTE' NOT NULL,
	"detalhes_placar" json,
	"registrado_por_id" uuid,
	"registrado_em" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panelinha_play_jogos_play_id_ordem_unique" UNIQUE("play_id","ordem")
);
--> statement-breakpoint
CREATE TABLE "panelinha_play_participantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"play_id" uuid NOT NULL,
	"atleta_id" uuid NOT NULL,
	"status" "status_panelinha_play_participante" DEFAULT 'ATIVO' NOT NULL,
	"entrou_em" timestamp DEFAULT now() NOT NULL,
	"saiu_em" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panelinha_play_participantes_play_id_atleta_id_unique" UNIQUE("play_id","atleta_id")
);
--> statement-breakpoint
CREATE TABLE "panelinha_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"organizador_id" uuid NOT NULL,
	"agendamento_id" text NOT NULL,
	"data_horario" timestamp NOT NULL,
	"quadra" text,
	"arena_nome" text,
	"status" "status_panelinha_play" DEFAULT 'RASCUNHO' NOT NULL,
	"formato" "formato_panelinha_play" NOT NULL,
	"config" json,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panelinha_ranking_jogos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"temporada_id" uuid NOT NULL,
	"play_id" uuid NOT NULL,
	"jogo_id" uuid NOT NULL,
	"atleta_id" uuid NOT NULL,
	"semana_key" text NOT NULL,
	"pontuacao" integer DEFAULT 0 NOT NULL,
	"vitoria" boolean DEFAULT false NOT NULL,
	"vitoria_tie_break" boolean DEFAULT false NOT NULL,
	"derrota_tie_break" boolean DEFAULT false NOT NULL,
	"games_feitos" integer DEFAULT 0 NOT NULL,
	"games_sofridos" integer DEFAULT 0 NOT NULL,
	"saldo_games" integer DEFAULT 0 NOT NULL,
	"ocorreu_em" timestamp NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panelinha_ranking_jogos_jogo_id_atleta_id_unique" UNIQUE("jogo_id","atleta_id")
);
--> statement-breakpoint
CREATE TABLE "panelinha_ranking_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"temporada_id" uuid NOT NULL,
	"play_id" uuid NOT NULL,
	"atleta_id" uuid NOT NULL,
	"semana_key" text NOT NULL,
	"pontuacao" numeric(10, 2) DEFAULT '0' NOT NULL,
	"jogos" integer DEFAULT 0 NOT NULL,
	"vitorias" integer DEFAULT 0 NOT NULL,
	"saldo_games" integer DEFAULT 0 NOT NULL,
	"primeiro_jogo_em" timestamp NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panelinha_ranking_plays_play_id_atleta_id_unique" UNIQUE("play_id","atleta_id")
);
--> statement-breakpoint
CREATE TABLE "panelinha_ranking_semanas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"temporada_id" uuid NOT NULL,
	"atleta_id" uuid NOT NULL,
	"semana_key" text NOT NULL,
	"pontuacao_semana" numeric(10, 2) DEFAULT '0' NOT NULL,
	"best_play_id" uuid,
	"qtd_plays_semana" integer DEFAULT 0 NOT NULL,
	"vitorias_semana" integer DEFAULT 0 NOT NULL,
	"saldo_games_semana" integer DEFAULT 0 NOT NULL,
	"primeiro_play_em" timestamp NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panelinha_ranking_semanas_temporada_id_atleta_id_semana_key_unique" UNIQUE("temporada_id","atleta_id","semana_key")
);
--> statement-breakpoint
CREATE TABLE "panelinha_ranking_temporadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"temporada_id" uuid NOT NULL,
	"atleta_id" uuid NOT NULL,
	"pontuacao_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"semanas_pontuadas" integer DEFAULT 0 NOT NULL,
	"qtd_plays_total" integer DEFAULT 0 NOT NULL,
	"vitorias_total" integer DEFAULT 0 NOT NULL,
	"saldo_games_total" integer DEFAULT 0 NOT NULL,
	"primeiro_play_em" timestamp NOT NULL,
	"posicao" integer,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panelinha_ranking_temporadas_temporada_id_atleta_id_unique" UNIQUE("temporada_id","atleta_id")
);
--> statement-breakpoint
CREATE TABLE "panelinha_temporadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panelinha_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"inicio_em" timestamp NOT NULL,
	"fim_em" timestamp,
	"status" "status_panelinha_temporada" DEFAULT 'ABERTA' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"campeao_atleta_id" uuid,
	"encerrada_em" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panelinhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"status" "status_panelinha" DEFAULT 'ATIVA' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"fundador_id" uuid NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "torneio_administradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "torneio_administradores_torneio_id_usuario_id_unique" UNIQUE("torneio_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "torneio_atleta_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"camiseta_opcao" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "torneio_atleta_prefs_torneio_id_usuario_id_unique" UNIQUE("torneio_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "torneio_comunicacao_destinatarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comunicacao_id" uuid NOT NULL,
	"torneio_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"telefone" text,
	"whatsapp_status" "status_comunicacao_whatsapp" DEFAULT 'PENDENTE' NOT NULL,
	"whatsapp_enviado_em" timestamp,
	"whatsapp_erro" text,
	"lida_em" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "torneio_comunicacao_destinatarios_comunicacao_id_usuario_id_unique" UNIQUE("comunicacao_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "torneio_comunicacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torneio_id" uuid NOT NULL,
	"categoria_id" uuid,
	"criado_por_id" uuid NOT NULL,
	"titulo" text,
	"mensagem" text NOT NULL,
	"enviar_whatsapp" boolean DEFAULT true NOT NULL,
	"publicar_no_app" boolean DEFAULT true NOT NULL,
	"total_destinatarios" integer DEFAULT 0 NOT NULL,
	"total_whatsapp_enviados" integer DEFAULT 0 NOT NULL,
	"total_whatsapp_falhas" integer DEFAULT 0 NOT NULL,
	"total_whatsapp_sem_telefone" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apoiadores" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "data_horario" timestamp;--> statement-breakpoint
ALTER TABLE "equipes" ADD COLUMN "capitao_usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "grupo_equipes" ADD COLUMN "cabeca_chave" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "inscricao_pagamentos" ADD COLUMN "status" text DEFAULT 'PENDENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "inscricao_pagamentos" ADD COLUMN "valor_devido" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "iniciado_em" timestamp;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "finalizado_em" timestamp;--> statement-breakpoint
ALTER TABLE "placar_submissoes" ADD COLUMN "confirmado_por_usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "oculto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "inscricao_com_ia" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "modelo_torneio" "modelo_torneio";--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "super_campeonato_formato" "super_campeonato_formato" DEFAULT '2_SET_SUPER_TIE';--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "card_apenas_com_fotos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "quadras_ativas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "painel_quadras_reservas" json;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "valor_primeira_inscricao" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "valor_inscricao_adicional" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "pix_chave" text;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "pix_nome" text;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "pix_cidade" text;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "camiseta_opcoes" json;--> statement-breakpoint
ALTER TABLE "torneios" ADD COLUMN "template_inscricao_url" text;--> statement-breakpoint
ALTER TABLE "panelinha_convites" ADD CONSTRAINT "panelinha_convites_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_convites" ADD CONSTRAINT "panelinha_convites_convidado_id_usuarios_id_fk" FOREIGN KEY ("convidado_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_convites" ADD CONSTRAINT "panelinha_convites_convidado_por_id_usuarios_id_fk" FOREIGN KEY ("convidado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_membros" ADD CONSTRAINT "panelinha_membros_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_membros" ADD CONSTRAINT "panelinha_membros_atleta_id_usuarios_id_fk" FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_membros" ADD CONSTRAINT "panelinha_membros_convidado_por_id_usuarios_id_fk" FOREIGN KEY ("convidado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_jogos" ADD CONSTRAINT "panelinha_play_jogos_play_id_panelinha_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_jogos" ADD CONSTRAINT "panelinha_play_jogos_dupla_a_atleta1_id_usuarios_id_fk" FOREIGN KEY ("dupla_a_atleta1_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_jogos" ADD CONSTRAINT "panelinha_play_jogos_dupla_a_atleta2_id_usuarios_id_fk" FOREIGN KEY ("dupla_a_atleta2_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_jogos" ADD CONSTRAINT "panelinha_play_jogos_dupla_b_atleta1_id_usuarios_id_fk" FOREIGN KEY ("dupla_b_atleta1_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_jogos" ADD CONSTRAINT "panelinha_play_jogos_dupla_b_atleta2_id_usuarios_id_fk" FOREIGN KEY ("dupla_b_atleta2_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_jogos" ADD CONSTRAINT "panelinha_play_jogos_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_participantes" ADD CONSTRAINT "panelinha_play_participantes_play_id_panelinha_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_play_participantes" ADD CONSTRAINT "panelinha_play_participantes_atleta_id_usuarios_id_fk" FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_plays" ADD CONSTRAINT "panelinha_plays_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_plays" ADD CONSTRAINT "panelinha_plays_organizador_id_usuarios_id_fk" FOREIGN KEY ("organizador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_jogos" ADD CONSTRAINT "panelinha_ranking_jogos_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_jogos" ADD CONSTRAINT "panelinha_ranking_jogos_temporada_id_panelinha_temporadas_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_jogos" ADD CONSTRAINT "panelinha_ranking_jogos_play_id_panelinha_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_jogos" ADD CONSTRAINT "panelinha_ranking_jogos_jogo_id_panelinha_play_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."panelinha_play_jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_jogos" ADD CONSTRAINT "panelinha_ranking_jogos_atleta_id_usuarios_id_fk" FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_plays" ADD CONSTRAINT "panelinha_ranking_plays_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_plays" ADD CONSTRAINT "panelinha_ranking_plays_temporada_id_panelinha_temporadas_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_plays" ADD CONSTRAINT "panelinha_ranking_plays_play_id_panelinha_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."panelinha_plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_plays" ADD CONSTRAINT "panelinha_ranking_plays_atleta_id_usuarios_id_fk" FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_semanas" ADD CONSTRAINT "panelinha_ranking_semanas_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_semanas" ADD CONSTRAINT "panelinha_ranking_semanas_temporada_id_panelinha_temporadas_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_semanas" ADD CONSTRAINT "panelinha_ranking_semanas_atleta_id_usuarios_id_fk" FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_semanas" ADD CONSTRAINT "panelinha_ranking_semanas_best_play_id_panelinha_plays_id_fk" FOREIGN KEY ("best_play_id") REFERENCES "public"."panelinha_plays"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_temporadas" ADD CONSTRAINT "panelinha_ranking_temporadas_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_temporadas" ADD CONSTRAINT "panelinha_ranking_temporadas_temporada_id_panelinha_temporadas_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."panelinha_temporadas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_ranking_temporadas" ADD CONSTRAINT "panelinha_ranking_temporadas_atleta_id_usuarios_id_fk" FOREIGN KEY ("atleta_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_temporadas" ADD CONSTRAINT "panelinha_temporadas_panelinha_id_panelinhas_id_fk" FOREIGN KEY ("panelinha_id") REFERENCES "public"."panelinhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinha_temporadas" ADD CONSTRAINT "panelinha_temporadas_campeao_atleta_id_usuarios_id_fk" FOREIGN KEY ("campeao_atleta_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panelinhas" ADD CONSTRAINT "panelinhas_fundador_id_usuarios_id_fk" FOREIGN KEY ("fundador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_administradores" ADD CONSTRAINT "torneio_administradores_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_administradores" ADD CONSTRAINT "torneio_administradores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_atleta_prefs" ADD CONSTRAINT "torneio_atleta_prefs_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_atleta_prefs" ADD CONSTRAINT "torneio_atleta_prefs_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_comunicacao_destinatarios" ADD CONSTRAINT "torneio_comunicacao_destinatarios_comunicacao_id_torneio_comunicacoes_id_fk" FOREIGN KEY ("comunicacao_id") REFERENCES "public"."torneio_comunicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_comunicacao_destinatarios" ADD CONSTRAINT "torneio_comunicacao_destinatarios_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_comunicacao_destinatarios" ADD CONSTRAINT "torneio_comunicacao_destinatarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_comunicacoes" ADD CONSTRAINT "torneio_comunicacoes_torneio_id_torneios_id_fk" FOREIGN KEY ("torneio_id") REFERENCES "public"."torneios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_comunicacoes" ADD CONSTRAINT "torneio_comunicacoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneio_comunicacoes" ADD CONSTRAINT "torneio_comunicacoes_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipes" ADD CONSTRAINT "equipes_capitao_usuario_id_usuarios_id_fk" FOREIGN KEY ("capitao_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placar_submissoes" ADD CONSTRAINT "placar_submissoes_confirmado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("confirmado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;