## Resposta Direta
- Sim: faz sentido **prever variações de regra de jogo por categoria** (e opcionalmente por fase) porque isso afeta:
  - validação do placar lançado
  - cálculo de vencedor/sets
  - estatísticas (games pró/contra para classificação)

## O que já existe hoje (Base Técnica)
- A tabela `partidas` já suporta placar detalhado via `detalhesPlacar` (JSON por set) e também `placarA/placarB` (sets). Isso permite representar:
  - 1 set até 6 com tie-break
  - 2 sets até 6 + super tie no 3º set
  - outras variações (ex.: set curto até 4)
- O serviço de classificação já soma games a partir de `detalhesPlacar`, então **padronizar essa estrutura** é o melhor caminho.

## Modelo Proposto de Regra de Jogo (no config da categoria)
- Adicionar em `CategoriaConfigV1` um bloco `regrasPartida`:
  - `tipo`: `SETS`
  - `melhorDe`: `1 | 3` (1 set ou melhor de 3)
  - `gamesPorSet`: `6` (ou `4` etc.)
  - `tiebreak`: `{ habilitado: boolean, em: 6, ate: 7, diffMin: 2 }`
  - `superTiebreakDecisivo` (para melhor de 3): `{ habilitado: boolean, ate: 10, diffMin: 2 }`
  - `porFase` (opcional): permitir override para `GRUPOS` vs `MATA_MATA`

## Representação do Placar (detalhesPlacar)
- Padronizar como array por set:
  - `[{ set: 1, a: 6, b: 4 }, { set: 2, a: 4, b: 6 }, { set: 3, a: 10, b: 8, tiebreak: true }]`
- Convenções:
  - sets normais: `a/b` = games do set
  - super tie: `tiebreak: true` e `a/b` = pontos do super tie

## Regras/Validações a Implementar
- Ao lançar/editar placar:
  - validar quantidade de sets conforme `melhorDe`
  - validar limite de games (ex.: set 6, tie-break em 6x6)
  - validar super tie no decisivo quando habilitado
  - calcular automaticamente:
    - `placarA/placarB` (sets ganhos)
    - `vencedorId`
    - status `FINALIZADA`

## Impacto no Desempate e Estatísticas
- Para grupos:
  - `saldoGames` vem dos games somados dos sets normais
  - super tie pode:
    - **não** entrar como games (recomendado) ou
    - entrar como pontos (se vocês preferirem). Vamos definir isso na regra.

## Entregáveis do MVP
1) Adicionar `regrasPartida` na config da categoria e UI simples para escolher:
   - “1 set até 6 com tie no 6x6”
   - “2 sets até 6 com tie no 6x6 + super tie até 10”
   - (deixar extensível para futuras opções)
2) Endpoint/UI de lançamento de placar na partida (admin), respeitando a regra
3) Ajustar classificação para ignorar/considerar super tie conforme regra

## Próximos Passos (Após Confirmação)
- Implementar as mudanças em três camadas: config → validação/cálculo de partida → atualização de classificação.
- Adicionar testes de validação de placar para cada formato.

Se você confirmar, eu começo pelo MVP com 2 presets exatamente como você descreveu e deixando o modelo pronto para adicionar novos formatos depois.