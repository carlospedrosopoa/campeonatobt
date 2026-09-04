-- =================================================================
-- MIGRATION: 1 equipe POR inscrição (elimina compartilhamento).
--
-- CONTEXTO: Historicamente o metodo inscricoesService.criar() usava
-- buscarEquipePorIntegrantes() para REUTILIZAR uma mesma equipe_id
-- sempre que os mesmos atletas (mesmos integrantes) apareciam em
-- QUALQUER categoria do MESMO torneio.
--
-- Problemas que este modelo causou em categorias MISTAS (mesmo torneio
-- com SIMPLES e DUPLAS):
--   * Inscricao de SIMPLES compartilhava equipe_id com a DUPLA dos
--     mesmos 2 atletas; editar a SIMPLES (que deveria ter 1 atleta)
--     removia os integrantes da DUPLA.
--   * capitao_usuario_id era 1 para todas as inscricoes da mesma
--     equipe — nao podia ser diferente por categoria.
--   * nome da equipe era compartilhado — nao podia ter "Amanda" numa
--     categoria Simples e "Amanda/Rosangela" na Dupla.
--
-- ESTRATEGIA (IDEMPOTENTE, segura para rodar multiplas vezes):
--   1) Identificar equipes que aparecem em > 1 inscricao (no mesmo
--      torneio ou em categorias diferentes).
--   2) Para cada inscricao COMPARTILHADA (equipe usada > 1 vez),
--      criar uma COPIA NOVA da equipe (nome + torneio_id +
--      capitao_usuario_id) com 1 unico proposito: servir SOMENTE
--      esta inscricao.
--   3) Clonar tambem os integrantes da equipe (equipe_integrantes)
--      para a equipe NOVA.
--   4) Repointar inscricoes.equipe_id da inscricao alvo para a
--      equipe NOVA (1 equipe por inscricao).
--   5) Se a inscricao for de SIMPLES (= categoria configurada com
--      tipoParticipacao = 'SIMPLES') e a equipe ORIGEM for DUPLA
--      (tamanho 2), ajustar tambem:
--        a. equipe.nome da copia = primeiro nome do atleta A/Capitao
--           ou do unico atleta com valor_devido em inscricao_pagamentos.
--        b. equipe_integrantes da copia = 1 linha SÓ (atleta real da
--           Simples), nao os 2 da dupla.
--   6) Preservar 100%: partidas, mata-mata, pagamentos,
--      torneio_atleta_prefs — tudo aponta para inscricao_id ou
--      usuario_id, nao para equipe_id, entao nao ha nada a migrar.
--
-- Seguro: usa DO $$ ... $$ plpgsql anonimo, nao recria objetos,
-- tem filtro WHERE contra reinsercoes duplicadas e comita apenas
-- os updates em inscricoes.
-- =================================================================

DO $$ DECLARE
  r RECORD;
  sharedeq_cnt BIGINT;
  copias_criadas_cnt BIGINT := 0;
  repointed_cnt BIGINT := 0;
  simples_ajustadas_cnt BIGINT := 0;
BEGIN

  -----------------------------------------------------------------
  -- Tabela auxiliar temporaria de trabalho (sessao).
  -----------------------------------------------------------------
  DROP TABLE IF EXISTS tmp_migra_equipe_por_inscricao;
  CREATE TEMP TABLE tmp_migra_equipe_por_inscricao (
    inscricao_id UUID PRIMARY KEY,
    categoria_id UUID NOT NULL,
    torneio_id UUID NOT NULL,
    equipe_antiga_id UUID NOT NULL,
    equipe_antiga_nome TEXT,
    equipe_antiga_capitao UUID,
    equipe_nova_id UUID,
    categoria_eh_simples BOOLEAN NOT NULL DEFAULT FALSE,
    atleta_simples_selecionado_id UUID
  ) ON COMMIT DROP;

  -----------------------------------------------------------------
  -- 1) Preenche: todas inscricoes cuja equipe_antiga é usada por
  --    MAIS de 1 inscricao (em qualquer categoria do bd).
  -----------------------------------------------------------------
  WITH equipes_compartilhadas AS (
    SELECT equipe_id AS eqid, count(*) AS qtde_inscricoes
    FROM inscricoes
    WHERE equipe_id IS NOT NULL
    GROUP BY equipe_id
    HAVING count(*) > 1
  )
  INSERT INTO tmp_migra_equipe_por_inscricao (
    inscricao_id,
    categoria_id,
    torneio_id,
    equipe_antiga_id,
    equipe_antiga_nome,
    equipe_antiga_capitao,
    categoria_eh_simples
  )
  SELECT
    i.id,
    i.categoria_id,
    i.torneio_id,
    i.equipe_id,
    eq.nome,
    eq.capitao_usuario_id,
    -- Tipos de categoria: se nao existe linha em categoria_configuracoes
    -- com tipoParticipacao = 'SIMPLES' explicitamente, trata como DUPLAS.
    -- O coalesce(JSONB_TYPEOF) garante que não trava em JSON null.
    COALESCE(
      (
        SELECT TRUE
        FROM categoria_configuracoes cc
        WHERE cc.categoria_id = i.categoria_id
          AND cc.config IS NOT NULL
          AND cc.config->>'tipoParticipacao' = 'SIMPLES'
        LIMIT 1
      ),
      FALSE
    ) AS categoria_eh_simples
  FROM inscricoes i
  INNER JOIN equipes eq ON eq.id = i.equipe_id
  INNER JOIN equipes_compartilhadas sh ON sh.eqid = i.equipe_id
  ORDER BY i.torneio_id, i.categoria_id, i.id;

  GET DIAGNOSTICS sharedeq_cnt = ROW_COUNT;

  RAISE NOTICE '1) Inscricoes candidatas em equipes compartilhadas: %', sharedeq_cnt;

  -----------------------------------------------------------------
  -- 2) Para SIMPLES: decidir qual atleta de uma equipe (muitas vezes
  --    dupla com 2 integrantes) é o atleta REAL desta inscricao.
  --    Ordem de confianca (igual backend / listarPorCategoria):
  --      1. capitao da equipe
  --      2. exatamente 1 pagamento com valor_devido preenchido
  --      3. se equipe compartilhada original tem 1 integrante só, ele
  --      4. fallback: primeiro integrante por ordem alfabetica
  -----------------------------------------------------------------
  FOR r IN SELECT * FROM tmp_migra_equipe_por_inscricao WHERE categoria_eh_simples LOOP
    DECLARE
      v_capitao UUID;
      v_qtde_integrantes INT;
      v_pgto_com_valor UUID;
      v_qtde_pgto_com_valor INT;
      v_primeiro UUID;
      v_escolhido UUID;
    BEGIN
      SELECT equipe_antiga_capitao INTO v_capitao
      FROM tmp_migra_equipe_por_inscricao
      WHERE inscricao_id = r.inscricao_id;

      SELECT count(*) INTO v_qtde_integrantes
      FROM equipe_integrantes ei
      WHERE ei.equipe_id = r.equipe_antiga_id;

      -- Conta pagamentos com valor_devido da inscricao
      SELECT usuario_id, count(*) OVER ()
      INTO v_pgto_com_valor, v_qtde_pgto_com_valor
      FROM inscricao_pagamentos ip
      WHERE ip.inscricao_id = r.inscricao_id
        AND ip.valor_devido IS NOT NULL
        AND ip.valor_devido::text <> '0'
      LIMIT 1;

      IF NOT FOUND THEN
        v_qtde_pgto_com_valor := 0;
        v_pgto_com_valor := NULL;
      END IF;

      -- Fallback 4: primeiro integrante
      SELECT usuario_id INTO v_primeiro
      FROM equipe_integrantes ei
      INNER JOIN usuarios u ON u.id = ei.usuario_id
      WHERE ei.equipe_id = r.equipe_antiga_id
      ORDER BY u.nome, ei.id
      LIMIT 1;

      -- Aplicar cascata de regras:
      IF v_capitao IS NOT NULL AND EXISTS (
        SELECT 1 FROM equipe_integrantes ei
        WHERE ei.equipe_id = r.equipe_antiga_id AND ei.usuario_id = v_capitao
      ) THEN
        v_escolhido := v_capitao;
      ELSIF v_qtde_integrantes = 1 THEN
        SELECT usuario_id INTO v_escolhido
        FROM equipe_integrantes ei
        WHERE ei.equipe_id = r.equipe_antiga_id
        LIMIT 1;
      ELSIF v_qtde_pgto_com_valor = 1 AND v_pgto_com_valor IS NOT NULL THEN
        v_escolhido := v_pgto_com_valor;
      ELSE
        v_escolhido := v_primeiro;
      END IF;

      UPDATE tmp_migra_equipe_por_inscricao
      SET atleta_simples_selecionado_id = v_escolhido
      WHERE inscricao_id = r.inscricao_id;

      simples_ajustadas_cnt := simples_ajustadas_cnt + 1;
    END;
  END LOOP;

  RAISE NOTICE '2) Inscricoes SIMPLES com atleta selecionado: %', simples_ajustadas_cnt;

  -----------------------------------------------------------------
  -- 3) Para CADA inscricao candidata: CRIAR equipe NOVA + integrantes
  -----------------------------------------------------------------
  FOR r IN SELECT * FROM tmp_migra_equipe_por_inscricao ORDER BY inscricao_id LOOP
    DECLARE
      v_nova_equipe_id UUID;
      v_nome_novo TEXT;
      v_capitao_novo UUID;
    BEGIN
      -- Nome da equipe NOVA:
      IF r.categoria_eh_simples AND r.atleta_simples_selecionado_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(split_part(trim(u.nome), ' ', 1), ''), trim(u.nome), r.equipe_antiga_nome)
        INTO v_nome_novo
        FROM usuarios u
        WHERE u.id = r.atleta_simples_selecionado_id;
        IF v_nome_novo IS NULL OR length(v_nome_novo) = 0 THEN
          v_nome_novo := r.equipe_antiga_nome;
        END IF;
        v_capitao_novo := r.atleta_simples_selecionado_id;
      ELSE
        v_nome_novo := r.equipe_antiga_nome;
        v_capitao_novo := r.equipe_antiga_capitao;
      END IF;

      -- Cria equipe NOVA (sempre, 1 por inscricao)
      INSERT INTO equipes (id, nome, torneio_id, capitao_usuario_id, criado_em)
      VALUES (gen_random_uuid(), v_nome_novo, r.torneio_id, v_capitao_novo, now())
      RETURNING id INTO v_nova_equipe_id;

      copias_criadas_cnt := copias_criadas_cnt + 1;

      -- Clona integrantes:
      IF r.categoria_eh_simples AND r.atleta_simples_selecionado_id IS NOT NULL THEN
        -- Somente 1 integrante (o atleta REAL da Simples)
        INSERT INTO equipe_integrantes (id, equipe_id, usuario_id, criado_em)
        VALUES (gen_random_uuid(), v_nova_equipe_id, r.atleta_simples_selecionado_id, now())
        ON CONFLICT DO NOTHING;
      ELSE
        -- DUPLAS / geral: copiar TUDO como esta
        INSERT INTO equipe_integrantes (id, equipe_id, usuario_id, criado_em)
        SELECT gen_random_uuid(), v_nova_equipe_id, ei.usuario_id, now()
        FROM equipe_integrantes ei
        WHERE ei.equipe_id = r.equipe_antiga_id
        ON CONFLICT DO NOTHING;
      END IF;

      UPDATE tmp_migra_equipe_por_inscricao
      SET equipe_nova_id = v_nova_equipe_id
      WHERE inscricao_id = r.inscricao_id;
    END;
  END LOOP;

  RAISE NOTICE '3) Equipes novas criadas: % (1 por inscricao)', copias_criadas_cnt;

  -----------------------------------------------------------------
  -- 4) Repointar inscricoes.equipe_id da copia compartilhada para
  --    a equipe NOVA.
  -----------------------------------------------------------------
  UPDATE inscricoes i
  SET equipe_id = tmp.equipe_nova_id
  FROM tmp_migra_equipe_por_inscricao tmp
  WHERE i.id = tmp.inscricao_id
    AND tmp.equipe_nova_id IS NOT NULL
    AND i.equipe_id = tmp.equipe_antiga_id; -- SEGURANCA extra

  GET DIAGNOSTICS repointed_cnt = ROW_COUNT;
  RAISE NOTICE '4) Inscricoes repontadas para equipe propria: %', repointed_cnt;

  RAISE NOTICE 'MIGRACAO CONCLUIDA. OK.';
END $$;
