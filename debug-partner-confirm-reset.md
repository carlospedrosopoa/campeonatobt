# Debug Session: partner-confirm-reset

## Status
- [OPEN]

## Symptom
- No chat publico de inscricao, apos confirmar o parceiro com uma mensagem como `perfeito este mesmo`, o agente reseta e volta a perguntar torneio/categoria em vez de seguir para a inscricao.

## Expected
- Manter `selectedCategory` e `partner` no estado da thread e avancar para a proxima etapa da inscricao.

## Hypotheses
- H1. O estado `partner_confirmation` nao persiste corretamente entre requests.
- H2. A frase `perfeito este mesmo` nao entra no detector de confirmacao curta.
- H3. Algum merge de estado remove `selectedCategory` ou `partner` apos a resposta de validacao do parceiro.
- H4. A rota publica normaliza `history` ou `conversationState` de forma que descaracteriza a etapa atual.
- H5. Um fallback do agente responde com saudacao/reinicio quando nenhuma guard especifica aciona para essa frase.

## Instrumentation Plan
- Adicionar logs de depuracao na rota publica e no agente para capturar:
- threadId, messageText normalizado, stage/awaitingField antes e depois do merge
- selectedTournament, selectedCategory e partner antes da decisao
- resultado do detector de confirmacao curta
- caminho de decisao tomado antes da resposta final

## Evidence
- A rota publica preservou `threadId`, `categoryId` e `conversationState` corretamente nos logs `D`.
- O estado inicial do agente tambem preservou a categoria no log `A`, descartando perda precoce do contexto de categoria.
- Evidencia direta do detector atual: `perfeito este mesmo` normaliza para `perfeito este mesmo` e retorna `ok: false`.
- Hipotese H2 confirmada: a confirmacao do parceiro nao estava sendo reconhecida para essa frase.
- Hipoteses H1 e H4 enfraquecidas pelos logs coletados; H5 continua como efeito colateral do `false` no detector.

## Fix
- Ajuste minimo em `isAffirmativeConfirmation()` para aceitar `esse mesmo`, `este mesmo`, `perfeito`, `exato`, `correto` e combinacoes como `perfeito este mesmo`.

## Verification
- Pendente de validacao no fluxo real com a instrumentacao ainda ativa.
