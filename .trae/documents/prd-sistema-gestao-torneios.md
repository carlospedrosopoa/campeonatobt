## 1. Visão Geral do Produto
Sistema moderno, responsivo e escalável para gestão completa de torneios esportivos, com foco inicial em Beach Tennis, mas preparado para Padel, Pickleball, Vôlei e Futvôlei. A plataforma permite que organizadores criem competições, gerenciem inscrições, gerem chaves de jogos e controlem resultados em tempo real.

O diferencial técnico é a arquitetura "API-First", onde o Frontend (Next.js) consome uma API robusta e desacoplada, permitindo que no futuro outros clientes (apps mobile, integrações de terceiros) consumam os mesmos serviços. Todo o banco de dados e lógica de negócio utiliza terminologia em **Português**.

## 2. Recursos Principais

### 2.1 Perfis de Usuário
| Perfil | Método de Cadastro | Permissões Principais |
|---|---|---|
| **Organizador** | Email/Senha | Criar torneios, configurar categorias, gerenciar inscrições, lançar resultados, definir horários. |
| **Atleta** | Email/CPF | Inscrever-se em torneios, visualizar histórico, acompanhar chaves e horários. |
| **Árbitro** | Convite do Organizador | Lançar resultados de partidas, validar WO. |
| **Visitante** | Sem cadastro | Visualizar torneios, chaves e resultados em tempo real. |

### 2.2 Módulos Funcionais
1.  **Multi-Esportes**: Suporte para configurar o tipo de esporte do torneio (Beach Tennis, Padel, etc.).
2.  **Gestão de Torneios**: Criação, edição, definição de datas, local, regulamento.
3.  **Categorias e Classes**: Configuração flexível (Masculino A/B/C, Feminino, Mista, etc.).
4.  **Inscrições**: Fluxo completo com validação de duplas e pagamento (futuro).
5.  **Gerador de Jogos**:
    -   **Fase de Grupos**: Algoritmo Round Robin (todos contra todos).
    -   **Eliminatórias**: Chaveamento automático (Mata-mata).
6.  **Agendamento**: Definição de quadras e horários para as partidas.
7.  **Resultados em Tempo Real**: Atualização de placares e avanço automático nas chaves.
8.  **Ranking**: Cálculo automático de classificação.

### 2.3 Detalhamento das Páginas (Frontend)
| Página | Descrição | Elementos Chave |
|---|---|---|
| **Home** | Landing page moderna | Destaque para torneios abertos, busca por esporte. |
| **Explorar Torneios** | Lista com filtros | Filtros por Esporte, Cidade, Data, Status. Cards visuais. |
| **Detalhe do Torneio** | Hub do evento | Info geral, lista de inscritos, chaves, programação. |
| **Área do Organizador** | Dashboard administrativo | Métricas, atalhos para criar torneio, gerenciar ativos. |
| **Gestão de Torneio** | Painel de controle | Abas para: Inscrições, Categorias, Tabela de Jogos, Quadras. |
| **Login/Registro** | Autenticação | Design limpo, recuperação de senha. |

## 3. Fluxos Principais

**Criação de Torneio (Organizador):**
1.  Login no sistema.
2.  Dashboard -> "Novo Torneio".
3.  Seleciona Esporte (ex: Beach Tennis).
4.  Preenche dados básicos (Nome, Local, Datas).
5.  Cria Categorias (ex: Mista C, Masc B).
6.  Publica o torneio.

**Geração de Jogos:**
1.  Após fim das inscrições, organizador acessa a categoria.
2.  Sistema sorteia grupos ou monta chaveamento.
3.  Organizador define quadras e horários (ou usa alocação automática/assistida).

## 4. Design de Interface (UI/UX)
-   **Estilo**: Clean, Moderno, "Mobile-First".
-   **Tema**: Adaptável ao esporte (ex: tons de azul/laranja para Beach Tennis).
-   **Responsividade**: Total. Tabelas devem se adaptar para cards em mobile.
-   **Feedback**: Loadings, Toasts de sucesso/erro, Confirmações modais.

## 5. Requisitos Técnicos Específicos
-   **Idioma do Banco de Dados**: Tabelas e colunas estritamente em Português (ex: `tb_torneios`, `nm_torneio`).
-   **Arquitetura**:
    -   `API`: Next.js Route Handlers (`/api/v1/...`).
    -   `Services`: Lógica de negócio isolada (`src/services/...`).
    -   `Frontend`: React Server Components + Client Components consumindo a API/Services.
-   **Exportação**: Capacidade de exportar dados para Excel (já validada no protótipo anterior).
