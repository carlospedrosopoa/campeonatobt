-- Modelo visual dos cards de divulgacao (jogo e inscricao) por torneio.
-- Padrao CLASSICO (layout anterior); NOVO = layout 2026-09 (conteudo so na faixa livre do template).
ALTER TABLE "torneios"
ADD COLUMN IF NOT EXISTS "layout_cards" text DEFAULT 'CLASSICO' NOT NULL;
