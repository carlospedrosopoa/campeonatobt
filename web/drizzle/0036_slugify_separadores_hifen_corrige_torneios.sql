DO $$
DECLARE
    r RECORD;
    novo_slug TEXT;
    base_slug TEXT;
    tentativa INT;
    candidatos TEXT[];
    existe_conflito BOOLEAN;
BEGIN
    -- 1) Cria ou substitui a funcao SQL de slugify IDENTICA a nova funcao TS do utils.ts (campeonatoBT/web/src/lib/utils.ts).
    --    Regras: lower -> unaccent -> separadores por hifen -> espacos por hifen -> remove nao alfanum/hifen -> collapse multiplos hifens -> trim hifens.
    CREATE OR REPLACE FUNCTION fn_slugify(p_text TEXT) RETURNS TEXT AS $slug$
    DECLARE
        s TEXT;
    BEGIN
        IF p_text IS NULL THEN RETURN ''; END IF;
        s := btrim(lower(public.unaccent(p_text)::TEXT));
        -- Troca SEPARADORES por hifen (igual regex TS /[\/\\.,;:&|_+=@#$%^*(){}[\]<>?!~`"'°ºª]+/g)
        s := regexp_replace(s, '[\/\\\.,;:&\|_\+=@#$%^\*\(\)\{\}\[\]<>?!~\`"''°ºª]+', '-', 'g');
        -- Espacos por hifen
        s := regexp_replace(s, '\s+', '-', 'g');
        -- Remove tudo que NAO for alfanumerico, underscore ou hifen
        s := regexp_replace(s, '[^a-z0-9_\-]+', '', 'g');
        -- Colapsa multiplos hifens
        s := regexp_replace(s, '\-+', '-', 'g');
        -- Trim hifen inicio/fim
        s := btrim(s, '-');
        RETURN s;
    END;
    $slug$ LANGUAGE plpgsql IMMUTABLE STRICT;

    -- 2) Garante que a extensao unaccent esteja disponivel. Se nao existir, tenta criar (precisa ser superuser, normalmente OK em Render/Supabase Postgres).
    BEGIN
        CREATE EXTENSION IF NOT EXISTS unaccent;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Nao foi possivel habilitar extensao unaccent (pode precisar de superuser). Prosseguindo sem unaccent se necessario.';
    END;

    -- 3) Atualiza SLUG de TODOS os torneios, recalculando a partir do NOME.
    --    Resolve conflitos: se 2+ torneios gerarem o mesmo slug (mesmo nome), adiciona sufixo -2, -3, ... enquanto houver duplicidade.
    --    Obs.: iteracao por torneio eh simples e segura para a quantidade de torneios existentes (< 10k tipicamente).
    FOR r IN SELECT id, nome, slug FROM torneios ORDER BY id ASC LOOP
        base_slug := fn_slugify(r.nome);
        IF base_slug IS NULL OR length(base_slug) = 0 THEN
            base_slug := 'torneio-' || translate(r.id::TEXT, '-', '');
        END IF;

        novo_slug := base_slug;
        tentativa := 1;
        LOOP
            -- Verifica se o slug novo ja existe em OUTRO torneio.
            SELECT EXISTS (
                SELECT 1 FROM torneios t WHERE t.slug = novo_slug AND t.id <> r.id
            ) INTO existe_conflito;

            EXIT WHEN existe_conflito = FALSE OR tentativa > 999;

            tentativa := tentativa + 1;
            novo_slug := base_slug || '-' || tentativa::TEXT;
        END LOOP;

        -- Aplica o UPDATE APENAS se o slug realmente mudou (evita writes e WAL inuteis).
        IF r.slug IS DISTINCT FROM novo_slug THEN
            UPDATE torneios SET slug = novo_slug WHERE id = r.id;
            RAISE NOTICE 'Torneio %: slug de "%" para "%"', r.id, coalesce(r.slug, '<NULL>'), novo_slug;
        END IF;
    END LOOP;

    -- 4) Opcionalmente: atualiza tambem o slug das categorias caso elas usem a mesma regra (redundancia segura, categorias costumam nao ter / mas ok).
    --    Comentado por padrao para evitar mudancas desnecessarias em categorias se o usuario nao pediu. Descomente se precisar.
    /*
    FOR r IN SELECT id, nome, slug FROM categorias ORDER BY id ASC LOOP
        base_slug := fn_slugify(r.nome);
        IF base_slug IS NULL OR length(base_slug) = 0 THEN
            base_slug := 'categoria-' || translate(r.id::TEXT, '-', '');
        END IF;

        novo_slug := base_slug;
        tentativa := 1;
        LOOP
            SELECT EXISTS (SELECT 1 FROM categorias c WHERE c.slug = novo_slug AND c.id <> r.id) INTO existe_conflito;
            EXIT WHEN existe_conflito = FALSE OR tentativa > 999;
            tentativa := tentativa + 1;
            novo_slug := base_slug || '-' || tentativa::TEXT;
        END LOOP;

        IF r.slug IS DISTINCT FROM novo_slug THEN
            UPDATE categorias SET slug = novo_slug WHERE id = r.id;
            RAISE NOTICE 'Categoria %: slug de "%" para "%"', r.id, coalesce(r.slug, '<NULL>'), novo_slug;
        END IF;
    END LOOP;
    */
END $$;
