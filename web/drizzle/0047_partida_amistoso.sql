-- Americano: jogo amistoso (nao deixa quadra parada; nao conta para o ranking de ninguem)
ALTER TABLE "partidas" ADD COLUMN IF NOT EXISTS "amistoso" boolean DEFAULT false NOT NULL;
