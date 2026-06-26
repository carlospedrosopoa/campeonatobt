CREATE TYPE "public"."super_campeonato_formato" AS ENUM('2_SET_SUPER_TIE', '1_SET');

ALTER TABLE "torneios" ADD COLUMN "super_campeonato_formato" "super_campeonato_formato" DEFAULT '2_SET_SUPER_TIE';
