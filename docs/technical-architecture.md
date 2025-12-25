# Arquitetura Técnica - Sistema de Gestão de Torneios de Beach Tennis (7ª Temporada)

## 1. Visão Geral
O sistema é uma aplicação Fullstack moderna construída sobre Next.js, focada em performance, SEO e experiência do usuário. A arquitetura desacopla a autenticação (via PlayNaQuadra) da gestão do torneio (Core Domain), permitindo evolução independente.

## 2. Stack Tecnológica
- **Frontend**: Next.js 14+ (App Router), React, Tailwind CSS, Lucide Icons.
- **Backend**: Next.js API Routes (Server Actions para mutações), Drizzle ORM.
- **Banco de Dados**: PostgreSQL.
- **Autenticação**: Híbrida (Validação de credenciais via PlayNaQuadra + JWT Próprio para sessão).
- **Hospedagem Sugerida**: Vercel (Frontend/API) + Supabase/Neon/Vercel Postgres (PostgreSQL).

## 3. Modelo de Dados (ERD Simplificado)

### Usuários e Perfis
- **User**: Tabela central de usuários.
  - `id`: UUID
  - `email`: String (Unique)
  - `name`: String
  - `playnaquadraId`: String (Referência externa para SSO)
  - `role`: Enum (ADMIN, ORGANIZER, PLAYER)
  - `avatarUrl`: String
  - `points`: Int (Ranking global)

### Torneios
- **Tournament**: Eventos principais.
  - `id`: UUID
  - `name`: String
  - `slug`: String (Unique, para URLs amigáveis)
  - `startDate`: DateTime
  - `endDate`: DateTime
  - `location`: String
  - `status`: Enum (DRAFT, OPEN_FOR_REGISTRATION, ONGOING, FINISHED)
  - `bannerUrl`: String

- **Category**: Categorias dentro de um torneio.
  - `id`: UUID
  - `tournamentId`: FK -> Tournament
  - `name`: String (ex: "Masculina B", "Mista C")
  - `price`: Decimal

### Competição
- **Registration**: Inscrição de uma dupla ou individual.
  - `id`: UUID
  - `categoryId`: FK -> Category
  - `player1Id`: FK -> User
  - `player2Id`: FK -> User (Opcional)
  - `status`: Enum (PENDING, APPROVED, REJECTED, PAID)
  - `paymentStatus`: Enum (WAITING, PAID)

- **Match**: Partidas.
  - `id`: UUID
  - `categoryId`: FK -> Category
  - `round`: Int (Fase: 1=Oitavas, 2=Quartas, etc)
  - `teamA`: JSON (Array de player IDs)
  - `teamB`: JSON (Array de player IDs)
  - `score`: String (ex: "6/4 6/3")
  - `winnerTeam`: Enum (A, B)
  - `status`: Enum (SCHEDULED, IN_PROGRESS, FINISHED)
  - `court`: String (Quadra)

## 4. Fluxo de Autenticação (SSO PlayNaQuadra)

1. **Login no Frontend**:
   - Usuário insere Email e Senha na tela de login da nossa aplicação.
2. **Proxy de Autenticação (Backend)**:
   - Nossa API (`POST /api/auth/login`) recebe as credenciais.
   - Faz uma requisição segura para a API do PlayNaQuadra.
3. **Validação**:
   - **Sucesso**: PlayNaQuadra retorna dados do usuário e token original.
   - **Sincronização**: Nosso backend verifica se o usuário já existe na tabela `User` pelo `email` ou `playnaquadraId`.
     - Se não existir, cria um novo registro (User Provisioning).
     - Se existir, atualiza dados básicos (nome, foto).
4. **Sessão Local**:
   - Nosso backend gera um **JWT Próprio** contendo o `userId` (nosso UUID) e `role`.
   - Retorna esse JWT para o frontend (via HttpOnly Cookie ou Bearer Token).
5. **Navegação**:
   - Frontend usa o JWT Próprio para acessar rotas protegidas (`/api/my-registrations`, `/admin/...`).

## 5. Estrutura de Pastas (Next.js App Router)

```
web/
├── src/
│   ├── app/
│   │   ├── (public)/          # Rotas públicas (Landing, Torneios)
│   │   │   ├── page.tsx
│   │   │   ├── torneios/
│   │   │   └── ranking/
│   │   ├── (auth)/            # Rotas de Autenticação
│   │   │   ├── login/
│   │   │   └── register/      # (Opcional, se permitir cadastro direto)
│   │   ├── (authenticated)/   # Rotas protegidas (Dashboard Atleta)
│   │   │   ├── dashboard/
│   │   │   └── minhas-inscricoes/
│   │   ├── admin/             # Rotas de Administração
│   │   │   ├── torneios/
│   │   │   └── usuarios/
│   │   └── api/               # API Routes
│   │       ├── auth/
│   │       ├── tournaments/
│   │       └── webhooks/      # Webhooks de pagamento
│   ├── components/
│   │   ├── ui/                # Componentes base (Botões, Inputs)
│   │   ├── tournaments/       # Componentes de negócio
│   │   ├── layout/
│   ├── db/
│   │   ├── schema.ts          # Definição de tabelas (Drizzle)
│   │   └── index.ts           # Conexão Drizzle Client
│   ├── lib/
│   │   └── auth.ts            # Lógica de validação de token
│   └── types/                 # Definições TypeScript
```

## 6. Integrações Externas
- **PlayNaQuadra API**: Autenticação e validação de vínculo federativo (se houver).
- **Gateway de Pagamento (Futuro)**: Stripe ou MercadoPago para processar inscrições.

## 7. Segurança
- **RBAC (Role-Based Access Control)**: Middleware do Next.js verifica o papel do usuário (ADMIN vs PLAYER) antes de renderizar páginas ou processar rotas de API.
- **Validação de Dados**: Zod para validar inputs de API e formulários.
