# Play Na Quadra - Convite de parceiro SEM perfil via WhatsApp (Gzappy) - PRD

## Overview
- **Summary**: Adicionar no fluxo de inscrição em categoria DUPLAS do app atleta um modo "parceiro SEM perfil Play Na Quadra": o atleta informará o NOME COMPLETO e o WHATSAPP do parceiro (ao invés de buscar/selecionar). O sistema campeonatoBT enviará UMA mensagem de WhatsApp via GZAPPY para o parceiro, com o nome do atleta solicitante, o nome do torneio + categoria, a explicação do interesse na inscrição e o LINK PARA CRIAR PERFIL no appatleta (URL de cadastro/criar conta).
- **Purpose**: Atualmente o modal de inscrição duplas obriga "parceiro com perfil cadastrado" — travando inscrições reais em torneios onde um dos atletas ainda não tem conta. O recurso remove o gargalo e automatiza o convite direto no WhatsApp do parceiro usando o serviço já existente no campeonatoBT (gzappy.service.ts + gzappy_config ativo/inativo + API key).
- **Target Users**: 1) Atletas logados no appatleta `atleta.playnaquadra.com.br/app/atleta/torneios` se inscrevendo em categorias DUPLAS. 2) Parceiros NÃO cadastrados que recebem WhatsApp. 3) Sistema campeonatoBT (emite a mensagem via integração Gzappy já existente).

## Goals
- Permitir inscrição com parceiro que não tem perfil, usando apenas nome + whatsapp do parceiro (front appatleta + API backend campeonatoBT valida).
- Enviar 1 mensagem de WhatsApp por convite através do serviço Gzappy do campeonatoBT (respeitando `gzappyConfig.ativo = true` e API_KEY configurada).
- Mensagem deve conter: nome do atleta QUEM CONVIDA, nome do torneio/categoria, frase explicativa "tem interesse em jogar X comigo?" e LINK para criar perfil appatleta.
- Registrar histórico de convites no banco (tabela nova `parceiro_convites_whatsapp`) com status do envio PENDENTE/ENVIADO/FALHA/SEM_WHATSAPP — semelhante ao fluxo `torneioComunicacoes` + `gzappy`.
- Backend (campeonatoBT) ao receber "parceiro convidado" NÃO cria inscrição imediatamente. Em vez disso: persiste um registro de "convite pendente" e **ainda bloqueia a inscrição final** até que o parceiro tenha perfil e possa ser selecionado. O atleta visualiza status do convite e opção de "reenviar" (rate limit).

## Non-Goals
- NÃO implementar fluxo completo de "convidar → criar conta → aceitar → fechar inscrição automaticamente" (auto-concluir inscrição após signup fora do escopo MVP). MVP só emite mensagem + registra status + deixa atleta saber "convite enviado".
- NÃO criar usuários/atletas automaticamente no Play Na Quadra a partir do convite (privacidade).
- NÃO alterar a API atual de inscrição `/api/v1/atleta/inscricoes` para aceitar parceiro sem ID no fluxo de POST inscricoes (ela continua exigindo parceiro existente; o convite é etapa ANTERIOR / anexa).
- NÃO integração nova de WhatsApp diferente do Gzappy (só usar o `gzappy.service.ts` existente com `v2-api.gzappy.com/message/send-text`).
- NÃO aplicar em categorias SIMPLES (não tem parceiro — inscrição direta continua sem mudança).

## Background & Context
- Modal atual de inscrição dupla no appatleta ([torneios/page.tsx](file:///c:/carlao-dev/appatleta/src/app/app/atleta/torneios/page.tsx)) diz "Selecione seu parceiro (precisa ter perfil cadastrado)." e NÃO tem saída quando o parceiro não tem perfil. Isto é um showstopper.
- Integração Gzappy JA EXISTE em campeonatoBT: [gzappy.service.ts](file:///c:/carlao-dev/campeonatoBT/web/src/services/gzappy.service.ts) provê `enviarMensagemGzappy({ destinatario, mensagem })`, `formatarNumeroGzappy`, valida `gzappyConfigService.obter()` (ativo + apiKey) e retorna `ok / skipped (falta config ou sem telefone normalizado)`.
- Tabela `gzappy_config` + service `gzappy-config.service.ts` já existem e são usados no fluxo `torneio-comunicacoes.service.ts` (envio em lote para inscritos).
- URL de criar perfil do app atleta já conhecida no sistema: `app-atleta-url.ts` [getAppAtletaUrl()](file:///c:/carlao-dev/campeonatoBT/web/src/lib/app-atleta-url.ts) retorna base, e fluxos AI já usam `https://atleta.playnaquadra.com.br/criar-conta` ([ai/tools.ts L123](file:///c:/carlao-dev/campeonatoBT/web/src/services/ai/tools.ts#L123)). Appatleta tem rota real [criar-conta/page.tsx](file:///c:/carlao-dev/appatleta/src/app/criar-conta/page.tsx).
- Dado de categoria tipo participacao (DUPLAS/SIMPLES) vem de `categoriaConfigService.obterOuDefault(categoriaId)` (`inscricoes/route.ts L193`), que também usaremos no backend do convite.

## Functional Requirements
- **FR-1 — UI novo no modal duplas (appatleta)**: Acima do input "Buscar parceiro" (ou abaixo do "Selecione um parceiro...") adicionar um CTA/aba/seção "PARCEIRO SEM PERFIL?" com dois campos obrigatórios: NOME COMPLETO e WHATSAPP, além do botão "Enviar convite WhatsApp".
- **FR-2 — Validação nome/whats (appatleta + backend campeonatoBT)**: Nome ≥ 2 partes (nome + sobrenome). WhatsApp normalizado por dígitos ≥ 10 (DDD + numero; backend aplica `formatarNumeroGzappy` e rejeita se vazio após normalizacao).
- **FR-3 — Endpoint POST /api/v1/atleta/parceiros/convites no campeonatoBT**: Recebe `{ torneioId?, categoriaId, parceiroNome, parceiroWhatsapp }`, valida auth do atleta logado (Bearer), valida torneio ABERTO e categoria DUPLAS, normaliza whatsapp, cria registro `parceiro_convites_whatsapp` com status PENDENTE, chama `enviarMensagemGzappy`, atualiza status ENVIADO/FALHA/SEM_WHATSAPP de acordo com retorno e retorna `{ ok, conviteId, status, mensagemPreview, linkCriarPerfil }`.
- **FR-4 — Persistencia do convite**: Migration nova `0037_parceiro_convites_whatsapp.sql` cria tabela com id PK, criado_em, torneio_id FK, categoria_id FK, atleta_convidante_id FK (usuarios.id), parceiro_nome, parceiro_whatsapp_normalizado, parceiro_whatsapp_bruto, mensagem_enviada_text, link_criar_perfil_usado, whatsapp_status (enum), whatsapp_enviado_em, whatsapp_erro, gzappy_response_jsonb, reenvio_count, ultimo_reenvio_em.
- **FR-5 — Montagem da mensagem WhatsApp (backend)**: Usar template PT-BR amigável: "Olá <NOME PARCEIRO>, tudo bem? 👋\n\n<NOME ATLETA CONVIDANTE> tem interesse em se inscrever no torneio <TORNEIO NOME> na categoria <CATEGORIA NOME> com você como parceiro(a).\n\nPara participar, crie seu perfil no Play Na Quadra Atleta pelo link abaixo:\n<LINK CRIAR PERFIL>\n\nApós criar o perfil, avise <PRIMEIRO NOME ATLETA> para ele(a) finalizar a inscrição.\n\n— Play Na Quadra".
- **FR-6 — Link criar perfil personalizado**: URL `{APPATLETA_URL}/criar-conta?utm_source=gzappy&utm_campaign=convite_parceiro&ref=<conviteId>` (conviteId em query param para futura rastreabilidade; o endpoint de signup pode ignorar, mas backend persiste o link exato enviado).
- **FR-7 — Feedback no modal appatleta após POST**: Se 200 ok → pill verde "Convite enviado para <NOME PARCEIRO> no WhatsApp 🎉" + card resumo (nome parceiro mascara whats 51 51 9****-****; status; link do torneio publico? opcional). Se gzappy sem configuração ativa/skipped: pill amarelo aviso "Sistema de WhatsApp desativado no momento — copie o link abaixo e envie manualmente". Se erro FALHA: pill vermelho + botão "Tentar novamente".
- **FR-8 — Copiar link manual fallback**: Sempre disponibilizar botão "Copiar link para criar perfil" (fallback manual se mensagem não sair / gzappy não ativo). Este link é idêntico ao da mensagem enviada.
- **FR-9 — Rate limit backend (reenvios)**: Mesmo (atleta_convidante, categoria_id, whatsapp_normalizado) = max 3 reenvios por período de 1 hora. Bloqueia com 429 + mensagem "Muitas tentativas. Aguarde 1 hora antes de reenviar.".
- **FR-10 — Retornar ao fluxo de selecionar parceiro depois do convite**: Mostrar pill "Aguardando <NOME PARCEIRO> criar perfil" com botão "Já criei / Recarregar busca" que dispara a busca de parceiro existente automaticamente com o nome informado, para caso o parceiro acabe de criar o perfil na hora.

## Non-Functional Requirements
- **NFR-1 — Idempotência**: Em menos de 60s, reenvio idêntico (mesmos parâmetros) NÃO insere 2 linhas novas na tabela; retorna a linha já existente e só reenvia WhatsApp se passar do limite mínimo de 30s.
- **NFR-2 — Segurança**: Endpoint convites requer autenticação Bearer completo do atleta logado (mesma `requireUser` atual usada em parceiros/route.ts). Nenhum dado de outro atleta é exposto.
- **NFR-3 — Privacy**: NÃO armazenar mensagens de texto em log/console; `mensagem_enviada_text` é armazenada apenas no registro de convite (proprietário atleta). NÃO logar numero completo de whatsapp em textos de erro (apenas máscara `51 99***-1234`).
- **NFR-4 — Idempotência de numero WhatsApp**: Backend deve normalizar (remover espaços, parênteses, traços, +, 0 à esquerda, prefixo 55) ANTES de qualquer comparação e gravar tanto bruto quanto normalizado.
- **NFR-5 — Zero blocking**: Se Gzappy estiver inativo ou retornar erro, a chamada de API NÃO deve falhar no cliente com 500. Continuar e retornar `{ ok: true, status: 'SEM_GZAPPY', mensagemSkipped: true, linkCriarPerfil }` para que o front mostre o fallback manual.
- **NFR-6 — Responsividade mobile**: A UI do "Parceiro sem perfil" deve caber no viewport 410px (viewport do app), sem scroll lateral.
- **NFR-7 — Tipagem TS 100%**: Novos endpoints / UI / state devem ter todos os tipos declarados (nenhum `any` restante após feature).

## Constraints
- **Technical**: Reusar `gzappy.service.ts` existente e `gzappy-config.service.ts` — NÃO refatorar a integração neste PR.
- **Technical**: Banco de dados Postgres com drizzle ORM; migration deve ser SQL puro e idempotente (`IF NOT EXISTS`) e seguir padrão da pasta drizzle/*.sql do campeonatoBT.
- **Business**: Não finalizar inscrição automaticamente. O fluxo oficial é: (1) enviar convite → (2) parceiro criar perfil → (3) atleta selecionar parceiro normalmente → (4) POST em `/inscricoes`.
- **Dependencies**: `appatleta` deve seguir base URL do backend da mesma forma que hoje (`campeonato-proxy`). CampeonatoBT deve consumir `getAppAtletaUrl()` de `lib/app-atleta-url.ts`.

## Assumptions
- Fluxo atual de `Buscar parceiro` e `Selecionar parceiro existente` continua idêntico (não há remoção de UI).
- O app atleta já tem token Bearer válido quando o atleta está logado na aba Torneios.
- Admin já sabe configurar Gzappy na tela /admin/configuracoes/gzappy (rota existe).
- WhatsApp brasileiro sempre tem DDD + numero (total 11 dígitos com 9 na frente; mínimo aceito 10 dígitos normalizados).
- O parceiro ao criar o perfil com MESMO whatsapp normalizado já aparece na busca "por telefone" no endpoint `/parceiros` atual (com `where` utilizando `regexp_replace(telefone, ...)` já existente ou similar). Se NÃO aparecer, a UI "já criei, recarregar" ajuda o atleta a verificar novamente.

## Acceptance Criteria

### AC-1: Modal duplas appatleta contém a seção "Parceiro sem perfil" com NOME e WHATSAPP + Botão enviar
- **Type**: `rule`
- **Given**: atleta logado, em aba inscrições, clica "Inscrever" em categoria DUPLAS, modal aberto.
- **When**: o atleta rola a tela do modal (abaixo dos resultados de busca / ou num toggle).
- **Then**: Aparece a seção com título/sub, input Nome Completo, input WhatsApp (type tel), botão "Enviar convite WhatsApp" e botão "Copiar link de criar perfil".
- **Pass Condition**: Elementos renderizados no DOM do modal, não aparecem em SIMPLES.
- **Evidence**: Screenshot localhost:3001 viewport 410px; grep por string "PARCEIRO SEM PERFIL" retorna linha dentro do modal de duplas; categoria SIMPLES abre sem os campos.

### AC-2: Endpoint `/parceiros/convites` cria registro no banco e envia WhatsApp via gzappy (com config ativa)
- **Type**: `rule`
- **Given**: gzappy_config.ativo=true e API_KEY preenchida; atleta autenticado; torneio.status=ABERTO e categoria=DUPLAS.
- **When**: `POST /api/v1/atleta/parceiros/convites` com payload válido.
- **Then**: (1) 1 linha inserida em `parceiro_convites_whatsapp` com status=PENDENTE e posterior atualização ENVIADO. (2) chamada `fetch` real v2-api.gzappy.com/message/send-text com Bearer válido. (3) resposta 200 { ok:true, status:'ENVIADO', conviteId, linkCriarPerfil }.
- **Pass Condition**: Row na tabela e resposta 200 com status ENVIADO; gravação do `gzappy_response_jsonb` e `whatsapp_enviado_em`.
- **Evidence**: Teste via curl com mock apiKey; row select na tabela após POST, campos status=ENVIADO e mensagem_text contém linkCriarPerfil.

### AC-3: Conteúdo da mensagem WhatsApp contém nome atleta, nome torneio, categoria e link
- **Type**: `rule`
- **Given**: Convite criado (POST válido).
- **When**: Inspecionar o campo `mensagem_enviada_text` da linha de convite e o payload enviado.
- **Then**: Texto contém nome completo parceiro (primeira linha), nome atleta, nome torneio, nome categoria e exatamente a URL `{appAtletaUrl}/criar-conta?ref=convite_<id>`.
- **Pass Condition**: Substring match das 5 informações.
- **Evidence**: Conteúdo de mensagem_text em row banco de teste.

### AC-4: Rate limit máximo 3 reenvios por hora por tupla (atleta + categoria + whats_normalized)
- **Type**: `rule`
- **Given**: 3 POSTs idênticos em < 1h.
- **When**: POST 4.
- **Then**: Resposta 429 + mensagem "Muitas tentativas..."
- **Pass Condition**: 429 status e sem nova linha no banco.
- **Evidence**: 4 chamadas sequenciais via curl; output status HTTP.

### AC-5: Gzappy inativo/skipped ainda retorna 200 + link para fallback manual
- **Type**: `rule`
- **Given**: gzappy_config.ativo=false OU apiKey vazia.
- **When**: POST convite.
- **Then**: Resposta 200 { ok: true, status: 'SEM_GZAPPY', mensagemSkipped: true, linkCriarPerfil }; NÃO grava status erro na coluna whatsapp_erro como falha (status = SEM_WHATSAPP/SEM_GZAPPY).
- **Pass Condition**: Status code 200; status !== 'FALHA'; linkCriarPerfil não vazio.
- **Evidence**: curl + update gzappy_config.

### AC-6: Validação bloqueia inscrição sem perfil válido — convite NÃO pula etapa de selecionar parceiro
- **Type**: `rule`
- **Given**: atleta acabou de enviar convite.
- **When**: ele clica em Confirmar inscrição sem ter selecionado parceiro real (id existente).
- **Then**: continua validação L196 existente `Selecione um parceiro com perfil no Play na Quadra` 400.
- **Pass Condition**: POST /inscricoes sem parceiroPlayAtletaId retorna 400.
- **Evidence**: curl POST /inscricoes com parceiro só nome/whats (sem id).

### AC-7: Mensagens de erro / sucessos do toast / UI no appatleta não expõem whatsapp completo
- **Type**: `rubric`
- **Dimension**: Privacidade e UX em UI mobile
- **Scale**: 1-5
- **Anchors**: 1 = Número completo em textos de erro/success; 3 = Número com máscara mas não responsivo em 410px; 5 = Máscara em todos avisos (DDD 9****-****), layout encaixa em 410px, copy-link, fallback manual, botão recarregar busca.
- **Pass Threshold**: >= 4
- **Evidence**: Screenshot viewport 410px dos estados pós-envio (sucesso e erro).

### AC-8: 0 erros TypeScript/JSX (GetDiagnostics) nos 3 arquivos principais do MVP
- **Type**: `rule`
- **Given**: arquivos: appatleta torneios/page.tsx, campeonatoBT parceiros/convites route.ts, campeonatoBT schema migration.
- **When**: salvar tudo e rodar GetDiagnostics.
- **Then**: array vazio [] 0 erros.
- **Pass Condition**: GetDiagnostics em cada arquivo retorna [].
- **Evidence**: tool output.

### AC-9: Nomes de tabela/enum/colunas em migration seguem padrão de schema.ts e SQL idempotente
- **Type**: `rule`
- **Given**: migration `0037_parceiro_convites_whatsapp.sql`.
- **When**: aplicar via drizzle-kit migrate 2 vezes consecutivas.
- **Then**: 2a rodada não dá erro (idempotente — IF NOT EXISTS e DO $$ plpgsql anônimo se necessário).
- **Pass Condition**: duas execuções do migrate exit 0.
- **Evidence**: 2 runs `npm run db:migrate` exit code 0.

## Open Questions
- [ ] Query param `ref=conviteId` na url do criar perfil deve salvar o ref em localStorage no appatleta e pré-preencher dados (nome, whatsapp) ou ignorar completamente? Assumimos NO MVP ignorar query param e apenas persistir para rastreio. PODE MUDAR na v1.1.
- [ ] No MVP: backend deve **bloquear** o parceiro se o whatsapp já for de um usuário existente (sugerir ao atleta buscar)? Assumimos NO MVP: retorna warning no response `{ aviso: 'Whatsapp já cadastrado, use selecionar parceiro' }` junto com sucesso (200), para não confundir. Front pode exibir pill azul. PODE MUDAR.
- [ ] Regex de validação whatsapp: aceitar números sem DDD (8 dígitos, só celular) e adicionar DDD padrão região do atleta? MVP NÃO FAZ — obrigar 10/11 dígitos.
