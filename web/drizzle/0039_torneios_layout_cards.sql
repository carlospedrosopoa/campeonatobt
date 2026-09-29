-- Modelo visual dos cards de divulgacao (jogo e inscricao) por torneio.
-- NOVO = layout 2026-09 (conteudo so na faixa livre do template); CLASSICO = layout anterior.
ALTER TABLE "torneios"
ADD COLUMN IF NOT EXISTS "layout_cards" text DEFAULT 'NOVO' NOT NULL;
