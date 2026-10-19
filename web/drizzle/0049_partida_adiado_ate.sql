-- Operacao ao vivo: "Pular" da mesa de controle tira o jogo das sugestoes ate este horario
ALTER TABLE "partidas" ADD COLUMN IF NOT EXISTS "adiado_ate" timestamp;
