-- Operacao ao vivo: avisar os atletas pelo WhatsApp quando o jogo e chamado (opcao da mesa de controle; o aviso no app continua)
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "whatsapp_chamada" boolean DEFAULT true NOT NULL;
