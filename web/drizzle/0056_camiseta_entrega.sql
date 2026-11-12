-- entrega da camiseta do torneio ao atleta (marcada na tela "Entrega de camisetas"); null = nao entregue
ALTER TABLE "torneio_atleta_prefs" ADD COLUMN IF NOT EXISTS "camiseta_entregue_em" timestamp;
