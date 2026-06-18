ALTER TABLE "panelinhas"
ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'America/Sao_Paulo';
