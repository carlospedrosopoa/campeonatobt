-- =================================================================
-- MIGRATION: repair equipes + partidas com leak entre categorias
-- (complemento de 0035_1_equipe_por_inscricao.sql).
--
-- Problema remanescente apÃ³s 0035_1:
--   * Inscricao de SIMPLES ainda partilhava equipe_id com outra dupla
--     quando o atleta (ex: Marcia) fazia uma inscricao INDIVIDUAL e
--     DEPOIS uma inscricao em DUPLAS usando buscarEquipePorIntegrantes
--     (ainda existia a equipe de 1 atleta compartilhada). Ao editar a
--     DUPLA, atualizar() deleta equipe_integrantes da equipe
--     compartilhada e reinsere com os 2 atletas da dupla -> a inscricao
--     de SIMPLES (que tambem aponta para a mesma equipe) passa a ter 2
--     atletas (Marcia/Taisson).
--   * Alem disso, a migration 0035_1 NAO ajustava as partidas geradas
--     com a equipe antiga compartilhada -> grade de jogos da tela
--     "jogos/page.tsx" continua mostrando a dupla errada mesmo depois
--     de apontar a inscricao para equipe nova.
--
-- ESTRATEGIA (IDEMPOTENTE, roda multiplas vezes):
--   1) CTE detecta TODAS inscricoes onde os atletas em
--      inscriÃ§Ã£o_Ã_pagamentos diferem dos integrantes da equipe atual,
--      ou a equipe Ã© usada em >1 inscriÃ§Ã£o.
--   2) Cria NOVA equipe por inscriÃ§Ã£o, inserindo SOMENTE os
--      integrantes listados em inscriÃ§Ã£o_Ã_pagamentos (verdade oficial
--      "por inscriÃ§Ã£o").
--   3) Atualiza inscricoes.equipe_id -> nova equipe.
--   4) ATUALIZA partidas.equipe_a_id / equipe_b_id de partidas
--      vinculadas aos mesmos torneio_id + categoria_id.
--   5) Atualiza tambem grupo_equipes (grade classificacao).
-- =================================================================

DO $$ DECLARE
  r RECORD;
  r2 RECORD;
  total_quebrados BIGINT;
  equipes_criadas BIGINT := 0;
  inscricoes_repontadas BIGINT := 0;
  partidas_repontadas BIGINT := 0;
  grupoequipes_repontadas BIGINT := 0;
BEGIN

  DROP TABLE IF EXISTS tmp_repair_equipes_por_categoria;
  CREATE TEMP TABLE tmp_repair_equipes_por_categoria (
    inscricao_id UUID PRIMARY KEY,
    torneio_id UUID NOT NULL,
    categoria_id UUID NOT NULL,
    equipe_antiga_id UUID NOT NULL,
    equipe_antiga_nome TEXT,
    equipe_antiga_capitao UUID,
    equipe_nova_id UUID,
    integrantes_corretos UUID[] NOT NULL DEFAULT '{}'::UUID[],
    nome_da_nova_equipe TEXT
  ) ON COMMIT DROP;

  -- Preenche tabela temporaria com todas inscricoes com problema de
  -- integridade entre:
  --   (equipe atual + equipe_integrantes)  vs  (inscricao_pagamentos)
  -- OU inscricoes cuja equipe Ã© compartilhada.
  WITH equipes_compartilhadas AS (
    SELECT equipe_id AS eqid, count(*) AS cnt
    FROM inscricoes
    WHERE equipe_id IS NOT NULL
    GROUP BY equipe_id
    HAVING count(*) > 1
  ),
  pagamentos_por_inscricao AS (
    SELECT
      ip.inscricao_id,
      array_agg(DISTINCT ip.usuario_id ORDER BY ip.usuario_id) AS atleta_ids
    FROM inscricao_pagamentos ip
    GROUP BY ip.inscricao_id
  ),
  integrantes_por_equipe AS (
    SELECT
      ei.equipe_id,
      array_agg(DISTINCT ei.usuario_id ORDER BY ei.usuario_id) AS atleta_ids
    FROM equipe_integrantes ei
    GROUP BY ei.equipe_id
  )
  INSERT INTO tmp_repair_equipes_por_categoria (
    inscricao_id,
    torneio_id,
    categoria_id,
    equipe_antiga_id,
    equipe_antiga_nome,
    equipe_antiga_capitao,
    integrantes_corretos
  )
  SELECT
    i.id                 AS inscricao_id,
    i.torneio_id         AS torneio_id,
    i.categoria_id       AS categoria_id,
    i.equipe_id          AS equipe_antiga_id,
    eq.nome              AS equipe_antiga_nome,
    eq.capitao_usuario_id AS equipe_antiga_capitao,
    COALESCE(pag.atleta_ids, '{}'::UUID[]) AS integrantes_corretos
  FROM inscricoes i
  INNER JOIN equipes eq             ON eq.id = i.equipe_id
  LEFT  JOIN equipes_compartilhadas shared ON shared.eqid = i.equipe_id
  LEFT  JOIN pagamentos_por_inscricao pag ON pag.inscricao_id = i.id
  LEFT  JOIN integrantes_por_equipe  eqint ON eqint.equipe_id = i.equipe_id
  WHERE i.equipe_id IS NOT NULL
    AND (
      shared.cnt > 1
      OR COALESCE(pag.atleta_ids, '{}'::UUID[]) <> COALESCE(eqint.atleta_ids, '{}'::UUID[])
      OR COALESCE(array_length(pag.atleta_ids, 1), 0) <> COALESCE(array_length(eqint.atleta_ids, 1), 0)
    )
  ORDER BY i.torneio_id, i.categoria_id, i.id;

  GET DIAGNOSTICS total_quebrados = ROW_COUNT;
  RAISE NOTICE '1) Inscricoes para reparar: %', total_quebrados;

  IF total_quebrados = 0 THEN
    RAISE NOTICE 'Nada a corrigir. Saindo.';
    RETURN;
  END IF;

  -----------------------------------------------------------------
  -- Define nome da nova equipe baseado nos atletas corretos da
  -- inscricao (1 atleta -> primeiro nome; 2 -> "Primeiro/Primeiro";
  -- >=3 -> fallback ao nome original).
  -----------------------------------------------------------------
  FOR r IN SELECT * FROM tmp_repair_equipes_por_categoria LOOP
    DECLARE
      v_nomes TEXT[] := '{}';
      v_nome_novo TEXT;
      v_capitao_novo UUID;
      v_nova_equipe UUID;
    BEGIN

      SELECT
        array_agg(
          COALESCE(
            NULLIF(split_part(trim(u.nome), ' ', 1), ''),
            trim(u.nome)
          )
          ORDER BY u.nome
        ),
        COALESCE(
          (SELECT u2.id FROM usuarios u2 WHERE u2.id = ANY(r.integrantes_corretos) AND u2.id = r.equipe_antiga_capitao LIMIT 1),
          r.integrantes_corretos[1]
        )
      INTO v_nomes, v_capitao_novo
      FROM usuarios u
      WHERE u.id = ANY(r.integrantes_corretos);

      IF COALESCE(array_length(v_nomes, 1), 0) = 1 THEN
        v_nome_novo := v_nomes[1];
      ELSIF COALESCE(array_length(v_nomes, 1), 0) = 2 THEN
        v_nome_novo := v_nomes[1] || '/' || v_nomes[2];
      ELSE
        v_nome_novo := r.equipe_antiga_nome;
      END IF;

      INSERT INTO equipes (id, nome, torneio_id, capitao_usuario_id, criado_em)
      VALUES (gen_random_uuid(), v_nome_novo, r.torneio_id, v_capitao_novo, now())
      RETURNING id INTO v_nova_equipe;

      equipes_criadas := equipes_criadas + 1;

      -- Integrantes corretos (apenas os que estao no pagamento da inscricao)
      INSERT INTO equipe_integrantes (id, equipe_id, usuario_id, criado_em)
      SELECT gen_random_uuid(), v_nova_equipe, unnest, now()
      FROM unnest(r.integrantes_corretos)
      ON CONFLICT DO NOTHING;

      UPDATE tmp_repair_equipes_por_categoria
      SET equipe_nova_id = v_nova_equipe,
          nome_da_nova_equipe = v_nome_novo
      WHERE inscricao_id = r.inscricao_id;
    END;
  END LOOP;

  RAISE NOTICE '2) Novas equipes criadas: %', equipes_criadas;

  -----------------------------------------------------------------
  -- 3) Atualizar inscricoes.equipe_id -> equipe nova (por inscricao)
  -----------------------------------------------------------------
  UPDATE inscricoes i
  SET equipe_id = tmp.equipe_nova_id
  FROM tmp_repair_equipes_por_categoria tmp
  WHERE i.id = tmp.inscricao_id
    AND tmp.equipe_nova_id IS NOT NULL
    AND i.equipe_id = tmp.equipe_antiga_id;

  GET DIAGNOSTICS inscricoes_repontadas = ROW_COUNT;
  RAISE NOTICE '3) Inscricoes repontadas: %', inscricoes_repontadas;

  -----------------------------------------------------------------
  -- 4) Atualizar partidas: precisamos mapear (torneio, categoria,
  --    equipe_antiga) -> equipe_nova a partir das inscricoes que
  --    foram repontadas. Uma mesma equipe_antiga pode ter vÃ¡rias
  --    equipes_novas dependendo da categoria; Ã© exatamente esse
  --    contexto que usamos em partidas.
  -----------------------------------------------------------------
  FOR r2 IN
    SELECT
      i.torneio_id         AS torneio_id,
      i.categoria_id       AS categoria_id,
      i.equipe_id          AS equipe_antiga,
      tmp.equipe_nova_id   AS equipe_nova
    FROM inscricoes i
    INNER JOIN tmp_repair_equipes_por_categoria tmp ON tmp.inscricao_id = i.id
    WHERE tmp.equipe_nova_id IS NOT NULL
    GROUP BY i.torneio_id, i.categoria_id, i.equipe_id, tmp.equipe_nova_id
  LOOP
    DECLARE
      rep_a BIGINT := 0;
      rep_b BIGINT := 0;
    BEGIN
      UPDATE partidas p
      SET equipe_a_id = r2.equipe_nova
      WHERE p.torneio_id   = r2.torneio_id
        AND p.categoria_id = r2.categoria_id
        AND p.equipe_a_id  = r2.equipe_antiga;
      GET DIAGNOSTICS rep_a = ROW_COUNT;

      UPDATE partidas p
      SET equipe_b_id = r2.equipe_nova
      WHERE p.torneio_id   = r2.torneio_id
        AND p.categoria_id = r2.categoria_id
        AND p.equipe_b_id  = r2.equipe_antiga;
      GET DIAGNOSTICS rep_b = ROW_COUNT;

      partidas_repontadas := partidas_repontadas + rep_a + rep_b;
    END;
  END LOOP;

  RAISE NOTICE '4) Partidas repontadas: %', partidas_repontadas;

  -----------------------------------------------------------------
  -- 5) Atualizar grupo_equipes (equipe_id por grupo na fase
  --    GRUPOS) e qualquer outra referencia futura (ex.: vencedor_id
  --    em partidas que ja foram finalizadas -> nao atualizamos, mas
  --    a migration 0035_1 tambem nao usava).
  -----------------------------------------------------------------
  FOR r2 IN
    SELECT
      ge.grupo_id          AS grupo_id,
      tmp_agg.equipe_antiga_id AS equipe_antiga,
      tmp_agg.equipe_nova_id   AS equipe_nova
    FROM grupo_equipes ge
    INNER JOIN grupos g ON g.id = ge.grupo_id
    INNER JOIN LATERAL (
      SELECT DISTINCT
        i.equipe_id          AS equipe_antiga_id,
        tmp.equipe_nova_id   AS equipe_nova_id
      FROM inscricoes i
      INNER JOIN tmp_repair_equipes_por_categoria tmp
              ON tmp.inscricao_id = i.id
             AND tmp.equipe_nova_id IS NOT NULL
      WHERE i.categoria_id = g.categoria_id
        AND i.torneio_id   = g.torneio_id
        AND i.equipe_id    = ge.equipe_id
      LIMIT 1
    ) tmp_agg ON TRUE
    WHERE tmp_agg.equipe_antiga_id IS NOT NULL
  LOOP
    DECLARE
      v_rows BIGINT;
    BEGIN
      UPDATE grupo_equipes
      SET equipe_id = r2.equipe_nova
      WHERE grupo_id  = r2.grupo_id
        AND equipe_id = r2.equipe_antiga;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      grupoequipes_repontadas := grupoequipes_repontadas + v_rows;
    END;
  END LOOP;

  RAISE NOTICE '5) Grupo_equipes repontadas: %', grupoequipes_repontadas;

  RAISE NOTICE 'REPAIR CONCLUIDO (total inscricoes: %, partidas: %, grupo_equipes: %).',
    inscricoes_repontadas, partidas_repontadas, grupoequipes_repontadas;
END $$;
