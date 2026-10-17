-- Flag por torneio: operacao ao vivo (fila automatica, tela da quadra e telao com chamada por voz)
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "operacao_ao_vivo" boolean DEFAULT false NOT NULL;
