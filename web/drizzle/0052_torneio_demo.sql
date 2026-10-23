-- torneio de demonstracao: atletas ficticios; oculto, mas as paginas publicas de ao vivo e painel de quadras abrem
ALTER TABLE "torneios" ADD COLUMN IF NOT EXISTS "demo" boolean DEFAULT false NOT NULL;
UPDATE "torneios" SET "demo" = true WHERE "slug" = 'demo-operacao-ao-vivo';
