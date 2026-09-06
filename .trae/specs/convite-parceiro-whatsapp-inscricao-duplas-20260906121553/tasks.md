# Play Na Quadra - Convite parceiro WhatsApp - Implementation Plan

Convenção: Paths são relativos a:
- CampeonatoBT = `c:\carlao-dev\campeonatoBT\web` (back + site público)
- AppAtleta = `c:\carlao-dev\appatleta` (front atleta)

---

## Task 1: Migration 0037_parceiro_convites_whatsapp.sql + schema drizzle types
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Criar migration `web/drizzle/0037_parceiro_convites_whatsapp.sql` (SQL puro, idempotente) com:
    1. Tabela `parceiro_convites_whatsapp`:
      - `id` UUID PK (gerar gen_random_uuid default)
      - `criado_em` + `atualizado_em` timestamptz
      - `torneio_id` FK torneios.id
      - `categoria_id` FK categorias.id
      - `atleta_convidante_id` FK usuarios.id (NOT NULL)
      - `parceiro_nome` VARCHAR (255 NOT NULL)
      - `parceiro_whatsapp_normalizado` VARCHAR (20 NOT NULL, `formatarNumeroGzappy` final)
      - `parceiro_whatsapp_bruto` VARCHAR (50 NOT NULL, entrada original)
      - `mensagem_enviada_text` TEXT (mensagem final enviada)
      - `link_criar_perfil_usado` TEXT (link exato enviado com ref=conviteId)
      - `whatsapp_status` ENUM = PENDENTE / ENVIADO / FALHA / SEM_GZAPPY / SEM_WHATSAPP / CANCELADO (reusar enum existente `status_comunicacao_whatsapp` ou criar novo)
      - `whatsapp_enviado_em` timestamptz
      - `whatsapp_erro` TEXT
      - `gzappy_response_jsonb` JSONB
      - `reenvio_count` INTEGER default 0
      - `ultimo_reenvio_em` timestamptz
    2. Índices: idx (atleta_convidante_id, categoria_id, parceiro_whatsapp_normalizado, criado_em DESC) + idx (parceiro_whatsapp_normalizado) + idx (torneio_id)
    3. CONSTRAINT check `parceiro_whatsapp_normalizado = regexp_replace(parceiro_whatsapp_normalizado, '\D','','g')` (só dígitos).
  - (Opcional) Adicionar tipagem type `ParceiroConviteWhatsapp` em um novo arquivo types ou em services, para evitar `any` no código.
- **Acceptance Criteria Addressed**: AC-4, AC-9
- **Test Requirements**:
  - `rule` TR-1.1: Migration roda 2x consecutivas (idempotente) com exit code 0. Evidence: dois runs de `npm run db:migrate` ou `npx drizzle-kit migrate`
  - `rule` TR-1.2: Insert de linha mínima não viola constraints (nome + whatsapp_normalizado ≥ 10 digitos / FKs existem). Evidence: SQL insert manual após migration.
- **Notes**: Migrations 0034/0035/0036 estão pendentes em local/prod; esta 0037 assume que as 3 estão aplicadas ou vem depois na ordem correta.

---

## Task 2: CampeonatoBT - Criar `convites.service.ts` (build mensagem, rate limit, salvar status)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Criar `web/src/services/parceiro-convites.service.ts` exportando:
    1. `normalizePhone(text) => digits` (reuse logic de `gzappy.formatarNumeroGzappy` / retorna só dígitos)
    2. `validateNomeCompleto(text) => string clean ou throws` (mínimo 2 palavras, máx 255 chars)
    3. `montarMensagemConvite({ parceiroNome, atletaConvidanteNome, torneioNome, categoriaNome, linkCriarPerfil }) => string multi-linha`
    4. `getOrCreateConviteParaReenvio({ atletaId, categoriaId, torneioId, parceiroNome, parceiroWhatsappBruto }) => { row, isFresh, podeReenviar, esperaSegundos }`
    5. `registrarEnvioGzappy(row, result)` (atualiza status, erro, jsonb, contagem)
    6. Helper `maskWhatsapp(phoneNormalizado) => "51 99***-1234"`
  - Montar link de criar perfil: `getAppAtletaUrl() + '/criar-conta?utm_source=gzappy&utm_campaign=convite_parceiro&ref=' + encodeURIComponent(conviteId)`
  - Rate limit: (atleta, categoria, whats_normalizado) → max 3 em 3600s (janela deslizante).
  - Idempotência: `isFresh` se outra linha idêntica criada nos últimos 60s → apenas retorna.
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4, AC-1, AC-8
- **Test Requirements**:
  - `rule` TR-2.1: `montarMensagemConvite(...)` retorna texto com 5 substrings obrigatórios: nomeParceiro, nomeAtleta, nomeTorneio, nomeCategoria, linkCriarPerfil.
  - `rule` TR-2.2: `normalizePhone` = `formatarNumeroGzappy` (mesmo output quando comparado com GzappyService)
  - `rubric` TR-2.3: Isolamento e acoplamento - Scale 1-5; 1 = duplicação de código enorme com gzappy/inscricoes; 5 = types próprios, reuso helpers existentes; Pass >= 4.

---

## Task 3: CampeonatoBT - Endpoint `POST /api/v1/atleta/parceiros/convites/route.ts`
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Endpoint protegido por `requireUser` (atleta logado Bearer).
  - Body esperado: `{ categoriaId: string, parceiroNome: string, parceiroWhatsapp: string }` (torneioId pode ser opcional, backend carrega via categoria → `categorias.torneioId`).
  - Validações:
    1. `categoriaId` existente e `status torneio` é ABERTO.
    2. tipo_participacao da categoria é DUPLAS (via categoriaConfigService).
    3. Nome e whats válidos (service).
    4. Rate limit 3 envios/hora; se falhar 429.
  - Passos:
    1. Buscar atletaLogado dados (nome, whatsapp para email).
    2. Buscar torneio/categoria.
    3. getOrCreateConviteParaReenvio.
    4. Montar mensagem com service (incluindo link ref=conviteId).
    5. Chamar `enviarMensagemGzappy({ destinatario: whats_normalizado, mensagem })`.
    6. Atualizar row com status, erro, jsonb via service.
    7. Retornar 200 JSON: `{ ok: boolean, conviteId, status, linkCriarPerfil, whatsappMascarado: maskWhatsapp(...), aviso?: 'WHATSAPP_JA_CADASTRADO' | null, mensagemPreview, envio: { ok, skipped, statusCode?, response? (SENSÍVEL omitir body) } }`.
  - Caso gzappy inativo/skipped → retornar `ok: true, status: 'SEM_GZAPPY'` (NÃO é erro 500), front mostrar fallback manual.
  - Warning: Se já existir usuário em `usuarios` com telefone = whats normalizado, incluir `aviso: 'WHATSAPP_JA_CADASTRADO'` para front mostrar pill "Já existe uma conta com este WhatsApp. Tente a busca normal.".
- **Acceptance Criteria Addressed**: AC-2, AC-4, AC-5, AC-8
- **Test Requirements**:
  - `rule` TR-3.1: Sem autenticação (ou token errado) retorna 401.
  - `rule` TR-3.2: Torneio que NÃO é ABERTO retorna 400 + mensagem explicativa.
  - `rule` TR-3.3: Categoria SIMPLES retorna 400 "Este recurso é apenas para duplas".
  - `rule` TR-3.4: Payload válido gzappy ativo → retorna status === 'ENVIADO' ou 'SEM_GZAPPY'; row criada na tabela.

---

## Task 4: AppAtleta - UI nova no modal Duplas: "Parceiro sem perfil?"
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3 (endpoint existente, mas pode codear UI primeiro mocado -> trocar depois)
- **Description**:
  - Editar `appatleta/src/app/app/atleta/torneios/page.tsx` (múltiplos states existem):
    1. Adicionar state de controle da aba do modal: `parceiroFonte: 'BUSCAR' | 'CONVIDAR'` (ou toggle visual 2 tabs).
  - No modal inscrição de DUPLAS (abaixo/ acima da busca de parceiro existente) inserir card/collapsible com title "Parceiro ainda não tem perfil? Convide por WhatsApp!"
  - Quando SIMPLES: colapsado/oculto por padrão.
  - Campos do card CONVIDAR:
    - Label "Nome completo do parceiro *" + input text obrigatório `parceiroSemPerfilNome`
    - Label "WhatsApp do parceiro *" + input tel obrigatório `parceiroSemPerfilWhats`` + máscara input (opcional) `(99) 99999-9999`
    - Botão primário "Enviar convite WhatsApp" (desabilitado se loading / campos inválidos).
    - Botão secundário "Copiar link criar perfil" (sempre habilitado).
  - Validação cliente:
    - Nome: mínimo 2 palavras.
    - WhatsApp: só números, mínimo 10 dígitos (DDD + 8 ou 9 dígitos).
  - Após clique "Enviar":
    - loading (botão desabilitado + "Enviando...")
    - POST campeonato `/v1/atleta/parceiros/convites` via proxy `campeonatoApi.post(...)`
    - Sucesso: Mostrar pill verde "Convite enviado para <Nome> (<MaskWhatsapp>) 🎉" + card resumo: "Assim que ele(a) criar o perfil, volte aqui e selecione no campo 'Buscar parceiro' (use o botão abaixo)." + botão secundário "Recarregar busca com nome do parceiro →" (que preenche `buscaParceiro` input com `parceiroSemPerfilNome` e dispara a busca existente).
    - Caso `SEM_GZAPPY` : pill amarelo "Sistema de WhatsApp desativado agora — use o link abaixo e envie manualmente" + card com o link e botão copiar.
    - Caso aviso WHATSAPP_JA_CADASTRADO: pill azul "Este WhatsApp já tem cadastro. Tente buscá-lo acima." + preenche `buscaParceiro` e chama a busca.
  - Exibir sempre, embaixo do card convidar, o link "Copiar link manual" como fallback.
  - Responsividade: Garantir caber em 410px sem overflow horizontal.
- **Acceptance Criteria Addressed**: AC-1, AC-6, AC-7, AC-8
- **Test Requirements**:
  - `rule` TR-4.1: Em modal de SIMPLES, o CARD "Convidar parceiro" NÃO é renderizado.
  - `rule` TR-4.2: Após envio com sucesso, pill verde visível com Nome + WhatsApp mascarado (número não aparece completo).
  - `rubric` TR-4.3 UX mobile: Scale 1-5; 1 = overflow horizontal no 410px; 5 = encaixa perfeitamente com gap simétrico, tipografia legível e hierarquia clara (busca vs convite).

---

## Task 5: Integração campeonatoApi (appatleta) cliente method POST convites
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 4 UI + Task 3 Endpoint
- **Description**:
  - Criar no front um helper type ParceiroConviteResponse, função assíncrona `convidarParceiroSemPerfil(payload)` que faz POST via `campeonatoApi` (já tem Authorization Bearer e proxy).
  - No error handling: se fetch 429 → pill vermelho "Você já convidou esta pessoa recentemente. Aguarde 1 hora para reenviar ou use o link manual abaixo."
  - Se 400 validation errors → exibir erro abaixo do input correto (nome ou whatsapp).
- **Acceptance Criteria Addressed**: AC-8, AC-7
- **Test Requirements**:
  - `rule` TR-5.1: 429 capturado corretamente e exibida mensagem user-friendly.
  - `rule` TR-5.2: 401 redireciona para login (igual outros métodos campeonatoApi).

---

## Task 6: Validação, Testes e Commit final
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1..5
- **Description**:
  - Executar GetDiagnostics em TODOS arquivos novos/alterados.
  - Aplicar migration 0037 (e 0034..0036 pendentes) no local.
  - Teste E2E manual em viewport 410px localhost:3001/app/atleta/torneios -> modal duplas -> inserir parceiro SEM perfil -> ver:
    1. Registro no banco.
    2. (Opcional) Mock Gzappy para não enviar mensagem de verdade, confirmar payload.
    3. Fallback copy-link em SEM_GZAPPY.
    4. Reenvio 4x -> bloqueio 429 no 4º.
  - Commits separados (convenção):
    - `chore(campeonatoBT migration 0037): ...`
    - `feat(campeonatoBT service): convites parceiro whatsapp ...``
    - `feat(campeonatoBT endpoint): POST /v1/atleta/parceiros/convites ...`
    - `feat(appatleta modal duplas): UI 'Parceiro sem perfil?' + integração endpoint`
- **Acceptance Criteria Addressed**: Todos AC (1..9) passam self-check.
- **Test Requirements**:
  - `rule` TR-6.1: GetDiagnostics([]) para arquivos modificados.
  - `rule` TR-6.2: Working tree `git status --porcelain` vazio após commits.
  - `rubric` TR-6.3: Qualidade históricos commits (convencionais, claros). Scale 1-5; threshold >= 4.
