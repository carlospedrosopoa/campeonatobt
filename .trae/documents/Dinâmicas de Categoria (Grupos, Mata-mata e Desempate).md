## Contexto Atual
- O banco já tem as peças para suportar grupos e mata-mata (`grupos`, `grupo_equipes`, `partidas` com `fase` e `grupoId` opcional), mas não há regras/configuração nem geração/cálculo implementados.

## Modelo de Configuração da Categoria
- Adotar um `config` versionado por categoria (preferência: JSON) para definir formato e regras.
- Estrutura proposta (exemplo):
  - `formato`: `GRUPOS` | `MATA_MATA` | `LIGA`
  - `grupos`: `{ modo: 'AUTO'|'MANUAL', tamanhoAlvo: 4|5, quantidade?: number }`
  - `classificacao`: `{ porGrupo: number, melhoresTerceiros?: number, criterioSeed: 'PONTOS'|'PONTOS_SALDO' }`
  - `fase2`: `{ habilitada: boolean, tipo: 'SEMIS'|'QUARTAS'|'OITAVAS'|'FINAL', cruzamento: 'PADRAO'|'SNAKE', temFinal: boolean }`
  - `desempate`: lista ordenada de critérios (ver abaixo)

## Regras Padrão (Sugestão Inicial)
- Pontuação na fase de grupos:
  - Vitória: 1 (ou 2) ponto(s) — escolher 1 padrão e manter consistente.
- Critérios de desempate (na ordem):
  1) Pontos
  2) Confronto direto (apenas em empate entre 2 equipes)
  3) Saldo de games (já existe `saldoGames` em `grupo_equipes`)
  4) Games pró
  5) Vitórias
  6) Sorteio (fallback)
- Observação: se quiser desempate por sets, vamos incluir campos adicionais (ou computar via `detalhesPlacar`).

## Quantos Grupos / Quantos Classificam
- Modo AUTO baseado em total de inscritos aprovados na categoria:
  - tamanho alvo do grupo (default 4):
    - 4 times/grupo → 6 jogos por grupo (round-robin)
    - 5 times/grupo → 10 jogos por grupo
  - `qtdGrupos = ceil(totalTimes / tamanhoAlvo)`
- Classificados por grupo (default):
  - até 2 grupos: classificam 2 por grupo (gera semi ou final)
  - 3–4 grupos: classificam 2 por grupo (gera quartas)
  - se não fechar chave (ex.: 3 grupos), usar `melhoresTerceiros` para completar 8.

## Cruzamento na Segunda Fase
- Para 2 grupos: A1×B2 e B1×A2; final entre vencedores.
- Para 4 grupos (quartas): A1×D2, B1×C2, C1×B2, D1×A2 (evita repetir grupo cedo).
- Para 3 grupos: classifica 1º e 2º de cada + 2 melhores 3º → chave de 8; seed por (pontos/saldo).
- Se grupo único:
  - Opção A (liga pura): campeão por tabela, sem final.
  - Opção B (mais “evento”): top2 fazem final; ou top4 fazem semi+final.

## Serviços/Rotinas Necessárias
- Gerador de fase de grupos:
  - Montar grupos (random, snake ou seed por ranking)
  - Gerar partidas round-robin por grupo
- Cálculo de classificação:
  - Atualizar `grupo_equipes` a partir de `partidas` finalizadas
  - Aplicar `desempate` para ordenar
- Gerador de mata-mata:
  - Criar partidas de OITAVAS/QUARTAS/SEMI/FINAL com base no cruzamento/seed

## API e Admin UI
- Admin (categoria):
  - Tela/section “Dinâmica da categoria” para configurar formato, grupos, classificados, fase2 e desempate.
  - Botões: “Gerar grupos e jogos”, “Recalcular classificação”, “Gerar mata-mata”.
- Endpoints:
  - `PUT /api/.../categorias/:id/config`
  - `POST /api/.../categorias/:id/gerar-grupos`
  - `POST /api/.../categorias/:id/recalcular-classificacao`
  - `POST /api/.../categorias/:id/gerar-mata-mata`

## Validação
- Cenários: 1 grupo (liga), 1 grupo + final, 2 grupos, 3 grupos (melhores terceiros), 4 grupos.
- Testes de desempate: empate de 2 e 3 equipes.

Se você confirmar, começo implementando o MVP:
1) Configuração mínima por categoria (tamanho alvo de grupo, classificados por grupo, temFinal e ordem de desempate).
2) Gerar grupos + round-robin.
3) Classificação automática com desempate + barra/indicadores por grupo.
4) Gerar semi/final (ou quartas) automaticamente quando fechar a chave.