-- =============================================================
-- MIGRATION 0037: Tabela parceiro_convites_whatsapp (MVP).
--
-- Armazena todos os convites "parceiro SEM perfil" enviados
-- pelo app atleta no modal duplas. 1 linha por envio (ou por
-- reenvio quando o rate limit permitir).
--
-- ESTRATEGIA (IDEMPOTENTE, safe 2x rodar):
--   1) Cria/confirma extensao pgcrypto (gen_random_uuid).
--   2) Cria ENUM novo específico status_convite_parceiro_whatsapp
--      (não reutiliza o status_comunicacao_whatsapp existente,
--       pois precisamos de SEM_GZAPPY e SEM_WHATSAPP específico).
--   3) CREATE TABLE IF NOT EXISTS parceiro_convites_whatsapp.
--   4) Adiciona constraints, indices.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    -- Cria enum novo SE ainda nao existir.
    IF NOT EXISTS (SELECT 1 FROM pg_type t
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = 'public'
                      AND t.typname = 'status_convite_parceiro_whatsapp') THEN
        CREATE TYPE status_convite_parceiro_whatsapp AS ENUM (
            'PENDENTE',
            'ENVIADO',
            'FALHA',
            'SEM_GZAPPY',
            'SEM_WHATSAPP',
            'CANCELADO'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS parceiro_convites_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    torneio_id UUID NOT NULL REFERENCES torneios(id) ON DELETE CASCADE,
    categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    atleta_convidante_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    parceiro_nome VARCHAR(255) NOT NULL,
    parceiro_whatsapp_bruto VARCHAR(50) NOT NULL,
    parceiro_whatsapp_normalizado VARCHAR(20) NOT NULL
        CONSTRAINT chk_parceiro_whatsapp_normalizado_digits_only
        CHECK (parceiro_whatsapp_normalizado = regexp_replace(parceiro_whatsapp_normalizado, '\D', '', 'g')
               AND length(parceiro_whatsapp_normalizado) BETWEEN 10 AND 20),

    mensagem_enviada_text TEXT,
    link_criar_perfil_usado TEXT,

    whatsapp_status status_convite_parceiro_whatsapp NOT NULL DEFAULT 'PENDENTE',
    whatsapp_enviado_em TIMESTAMPTZ,
    whatsapp_erro TEXT,
    gzappy_response_jsonb JSONB,

    reenvio_count INTEGER NOT NULL DEFAULT 0,
    ultimo_reenvio_em TIMESTAMPTZ
);

-- Indices essenciais
CREATE INDEX IF NOT EXISTS idx_parceiro_convites_lookup
    ON parceiro_convites_whatsapp
    (atleta_convidante_id, categoria_id, parceiro_whatsapp_normalizado, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_parceiro_convites_whatsapp
    ON parceiro_convites_whatsapp (parceiro_whatsapp_normalizado);

CREATE INDEX IF NOT EXISTS idx_parceiro_convites_torneio
    ON parceiro_convites_whatsapp (torneio_id);

CREATE INDEX IF NOT EXISTS idx_parceiro_convites_status
    ON parceiro_convites_whatsapp (whatsapp_status);

-- Trigger auto-atualiza atualizado_em sempre (reutiliza pattern do
-- resto do schema — mesmo se o trigger geral existir por tabela,
-- garantimos aqui para esta tabela nova).
CREATE OR REPLACE FUNCTION fn_trg_atualiza_atualizado_em()
RETURNS trigger AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parceiro_convites_whatsapp_atualiza_em
    ON parceiro_convites_whatsapp;

CREATE TRIGGER trg_parceiro_convites_whatsapp_atualiza_em
BEFORE UPDATE ON parceiro_convites_whatsapp
FOR EACH ROW
EXECUTE FUNCTION fn_trg_atualiza_atualizado_em();
