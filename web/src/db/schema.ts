import { pgTable, serial, text, timestamp, boolean, uuid, integer, decimal, json, date, pgEnum, unique } from 'drizzle-orm/pg-core';

// Enums
export const perfilEnum = pgEnum('perfil_usuario', ['ADMIN', 'ORGANIZADOR', 'ATLETA']);
export const statusTorneioEnum = pgEnum('status_torneio', ['RASCUNHO', 'ABERTO', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO']);
export const statusPartidaEnum = pgEnum('status_partida', ['AGENDADA', 'EM_ANDAMENTO', 'FINALIZADA', 'WO', 'CANCELADA']);
export const faseTorneioEnum = pgEnum('fase_torneio', ['GRUPOS', 'OITAVAS', 'QUARTAS', 'SEMI', 'FINAL']);
export const statusInscricaoEnum = pgEnum('status_inscricao', ['PENDENTE', 'APROVADA', 'RECUSADA', 'FILA_ESPERA']);
export const generoCategoriaEnum = pgEnum('genero_categoria', ['MASCULINO', 'FEMININO', 'MISTO']);
export const statusPlacarSubmissaoEnum = pgEnum('status_placar_submissao', ['PENDENTE', 'CONFIRMADA', 'CANCELADA']);
export const statusPanelinhaEnum = pgEnum('status_panelinha', ['ATIVA', 'INATIVA']);
export const papelPanelinhaMembroEnum = pgEnum('papel_panelinha_membro', ['FUNDADOR', 'MEMBRO']);
export const statusPanelinhaMembroEnum = pgEnum('status_panelinha_membro', ['ATIVO', 'INATIVO', 'REMOVIDO']);
export const statusPanelinhaConviteEnum = pgEnum('status_panelinha_convite', ['PENDENTE', 'ACEITO', 'RECUSADO', 'CANCELADO', 'EXPIRADO']);
export const statusPanelinhaPlayEnum = pgEnum('status_panelinha_play', ['RASCUNHO', 'ABERTO', 'FINALIZADO', 'CANCELADO']);
export const formatoPanelinhaPlayEnum = pgEnum('formato_panelinha_play', ['SUPER4', 'CONFRONTO_LIVRE']);
export const statusPanelinhaPlayParticipanteEnum = pgEnum('status_panelinha_play_participante', ['ATIVO', 'REMOVIDO']);
export const statusPanelinhaPlayJogoEnum = pgEnum('status_panelinha_play_jogo', ['PENDENTE', 'REGISTRADO', 'CONFIRMADO', 'CANCELADO']);
export const statusPanelinhaTemporadaEnum = pgEnum('status_panelinha_temporada', ['ABERTA', 'ENCERRADA']);

// Tabelas

export const esportes = pgTable('esportes', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(), // Ex: Beach Tennis, Padel
  slug: text('slug').notNull().unique(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const usuarios = pgTable('usuarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  senha: text('senha'), // Opcional se usar apenas Auth externo, mas bom ter campo
  perfil: perfilEnum('perfil').default('ATLETA').notNull(),
  playnaquadraAtletaId: text('playnaquadra_atleta_id').unique(),
  fotoUrl: text('foto_url'),
  telefone: text('telefone'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const panelinhas = pgTable('panelinhas', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  status: statusPanelinhaEnum('status').default('ATIVA').notNull(),
  timezone: text('timezone').default('America/Sao_Paulo').notNull(),
  fundadorId: uuid('fundador_id').references(() => usuarios.id).notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const panelinhaTemporadas = pgTable('panelinha_temporadas', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  nome: text('nome').notNull(),
  inicioEm: timestamp('inicio_em').notNull(),
  fimEm: timestamp('fim_em'),
  status: statusPanelinhaTemporadaEnum('status').default('ABERTA').notNull(),
  timezone: text('timezone').default('America/Sao_Paulo').notNull(),
  campeaoAtletaId: uuid('campeao_atleta_id').references(() => usuarios.id),
  encerradaEm: timestamp('encerrada_em'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const panelinhaRankingJogos = pgTable('panelinha_ranking_jogos', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  temporadaId: uuid('temporada_id').references(() => panelinhaTemporadas.id, { onDelete: "cascade" }).notNull(),
  playId: uuid('play_id').references(() => panelinhaPlays.id, { onDelete: "cascade" }).notNull(),
  jogoId: uuid('jogo_id').references(() => panelinhaPlayJogos.id, { onDelete: "cascade" }).notNull(),
  atletaId: uuid('atleta_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  semanaKey: text('semana_key').notNull(),
  pontuacao: integer('pontuacao').default(0).notNull(),
  vitoria: boolean('vitoria').default(false).notNull(),
  vitoriaTieBreak: boolean('vitoria_tie_break').default(false).notNull(),
  derrotaTieBreak: boolean('derrota_tie_break').default(false).notNull(),
  gamesFeitos: integer('games_feitos').default(0).notNull(),
  gamesSofridos: integer('games_sofridos').default(0).notNull(),
  saldoGames: integer('saldo_games').default(0).notNull(),
  ocorreuEm: timestamp('ocorreu_em').notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.jogoId, t.atletaId),
}));

export const panelinhaRankingPlays = pgTable('panelinha_ranking_plays', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  temporadaId: uuid('temporada_id').references(() => panelinhaTemporadas.id, { onDelete: "cascade" }).notNull(),
  playId: uuid('play_id').references(() => panelinhaPlays.id, { onDelete: "cascade" }).notNull(),
  atletaId: uuid('atleta_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  semanaKey: text('semana_key').notNull(),
  pontuacao: decimal('pontuacao', { precision: 10, scale: 2 }).default('0').notNull(),
  jogos: integer('jogos').default(0).notNull(),
  vitorias: integer('vitorias').default(0).notNull(),
  saldoGames: integer('saldo_games').default(0).notNull(),
  primeiroJogoEm: timestamp('primeiro_jogo_em').notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.playId, t.atletaId),
}));

export const panelinhaRankingSemanas = pgTable('panelinha_ranking_semanas', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  temporadaId: uuid('temporada_id').references(() => panelinhaTemporadas.id, { onDelete: "cascade" }).notNull(),
  atletaId: uuid('atleta_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  semanaKey: text('semana_key').notNull(),
  pontuacaoSemana: decimal('pontuacao_semana', { precision: 10, scale: 2 }).default('0').notNull(),
  bestPlayId: uuid('best_play_id').references(() => panelinhaPlays.id),
  qtdPlaysSemana: integer('qtd_plays_semana').default(0).notNull(),
  vitoriasSemana: integer('vitorias_semana').default(0).notNull(),
  saldoGamesSemana: integer('saldo_games_semana').default(0).notNull(),
  primeiroPlayEm: timestamp('primeiro_play_em').notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.temporadaId, t.atletaId, t.semanaKey),
}));

export const panelinhaRankingTemporadas = pgTable('panelinha_ranking_temporadas', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  temporadaId: uuid('temporada_id').references(() => panelinhaTemporadas.id, { onDelete: "cascade" }).notNull(),
  atletaId: uuid('atleta_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  pontuacaoTotal: decimal('pontuacao_total', { precision: 10, scale: 2 }).default('0').notNull(),
  semanasPontuadas: integer('semanas_pontuadas').default(0).notNull(),
  qtdPlaysTotal: integer('qtd_plays_total').default(0).notNull(),
  vitoriasTotal: integer('vitorias_total').default(0).notNull(),
  saldoGamesTotal: integer('saldo_games_total').default(0).notNull(),
  primeiroPlayEm: timestamp('primeiro_play_em').notNull(),
  posicao: integer('posicao'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.temporadaId, t.atletaId),
}));

export const panelinhaMembros = pgTable('panelinha_membros', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  atletaId: uuid('atleta_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  papel: papelPanelinhaMembroEnum('papel').default('MEMBRO').notNull(),
  status: statusPanelinhaMembroEnum('status').default('ATIVO').notNull(),
  convidadoPorId: uuid('convidado_por_id').references(() => usuarios.id),
  entrouEm: timestamp('entrou_em').defaultNow().notNull(),
  saiuEm: timestamp('saiu_em'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.panelinhaId, t.atletaId),
}));

export const panelinhaConvites = pgTable('panelinha_convites', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  convidadoId: uuid('convidado_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  convidadoPorId: uuid('convidado_por_id').references(() => usuarios.id).notNull(),
  status: statusPanelinhaConviteEnum('status').default('PENDENTE').notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  respondidoEm: timestamp('respondido_em'),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const panelinhaPlays = pgTable('panelinha_plays', {
  id: uuid('id').defaultRandom().primaryKey(),
  panelinhaId: uuid('panelinha_id').references(() => panelinhas.id, { onDelete: "cascade" }).notNull(),
  organizadorId: uuid('organizador_id').references(() => usuarios.id).notNull(),
  agendamentoId: text('agendamento_id').notNull(),
  dataHorario: timestamp('data_horario').notNull(),
  quadra: text('quadra'),
  arenaNome: text('arena_nome'),
  status: statusPanelinhaPlayEnum('status').default('RASCUNHO').notNull(),
  formato: formatoPanelinhaPlayEnum('formato').notNull(),
  config: json('config').$type<Record<string, unknown> | null>(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const panelinhaPlayParticipantes = pgTable(
  'panelinha_play_participantes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playId: uuid('play_id').references(() => panelinhaPlays.id, { onDelete: "cascade" }).notNull(),
    atletaId: uuid('atleta_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
    status: statusPanelinhaPlayParticipanteEnum('status').default('ATIVO').notNull(),
    entrouEm: timestamp('entrou_em').defaultNow().notNull(),
    saiuEm: timestamp('saiu_em'),
    criadoEm: timestamp('criado_em').defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
  },
  (t) => ({
    unq: unique().on(t.playId, t.atletaId),
  })
);

export const panelinhaPlayJogos = pgTable(
  'panelinha_play_jogos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playId: uuid('play_id').references(() => panelinhaPlays.id, { onDelete: "cascade" }).notNull(),
    ordem: integer('ordem').notNull(),
    duplaAAtleta1Id: uuid('dupla_a_atleta1_id').references(() => usuarios.id).notNull(),
    duplaAAtleta2Id: uuid('dupla_a_atleta2_id').references(() => usuarios.id).notNull(),
    duplaBAtleta1Id: uuid('dupla_b_atleta1_id').references(() => usuarios.id).notNull(),
    duplaBAtleta2Id: uuid('dupla_b_atleta2_id').references(() => usuarios.id).notNull(),
    status: statusPanelinhaPlayJogoEnum('status').default('PENDENTE').notNull(),
    detalhesPlacar: json('detalhes_placar').$type<any>(),
    registradoPorId: uuid('registrado_por_id').references(() => usuarios.id),
    registradoEm: timestamp('registrado_em'),
    criadoEm: timestamp('criado_em').defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
  },
  (t) => ({
    unq: unique().on(t.playId, t.ordem),
  })
);

export const superCampeonatoFormatoEnum = pgEnum('super_campeonato_formato', ['2_SET_SUPER_TIE', '1_SET']);

export const torneios = pgTable('torneios', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  slug: text('slug').notNull().unique(),
  descricao: text('descricao'),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim').notNull(),
  local: text('local').notNull(),
  status: statusTorneioEnum('status').default('RASCUNHO').notNull(),
  oculto: boolean('oculto').default(false).notNull(),
  inscricaoComIa: boolean('inscricao_com_ia').default(false).notNull(),
  superCampeonato: boolean('super_campeonato').default(false).notNull(),
  superCampeonatoFormato: superCampeonatoFormatoEnum('super_campeonato_formato').default('2_SET_SUPER_TIE'),
  cardApenasComFotos: boolean('card_apenas_com_fotos').default(false).notNull(),
  quadrasAtivas: integer('quadras_ativas').default(0).notNull(),
  painelQuadrasReservas: json('painel_quadras_reservas').$type<
    { quadraNumero: number; categoriaId: string; fase: string; grupoId?: string | null }[]
  >(),
  valorPrimeiraInscricao: decimal('valor_primeira_inscricao', { precision: 10, scale: 2 }),
  valorInscricaoAdicional: decimal('valor_inscricao_adicional', { precision: 10, scale: 2 }),
  pixChave: text('pix_chave'),
  pixNome: text('pix_nome'),
  pixCidade: text('pix_cidade'),
  camisetaOpcoes: json('camiseta_opcoes').$type<string[]>(),
  esporteId: uuid('esporte_id').references(() => esportes.id),
  organizadorId: uuid('organizador_id').references(() => usuarios.id).notNull(),
  bannerUrl: text('banner_url'),
  logoUrl: text('logo_url'),
  templateUrl: text('template_url'),
  templateInscricaoUrl: text('template_inscricao_url'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const torneioAdministradores = pgTable('torneio_administradores', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id, { onDelete: 'cascade' }).notNull(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }).notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.torneioId, t.usuarioId),
}));

export const categorias = pgTable('categorias', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  nome: text('nome').notNull(), // Ex: "Mista C", "Feminina PRO"
  slug: text('slug').notNull(),
  genero: generoCategoriaEnum('genero').notNull(),
  valorInscricao: decimal('valor_inscricao', { precision: 10, scale: 2 }).default('0'), // Valor por atleta
  vagasMaximas: integer('vagas_maximas'),
  dataHorario: timestamp('data_horario'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.torneioId, t.slug),
}));

export const categoriaConfiguracoes = pgTable('categoria_configuracoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoriaId: uuid('categoria_id')
    .references(() => categorias.id)
    .notNull()
    .unique(),
  versao: integer('versao').default(1).notNull(),
  config: json('config').$type<Record<string, unknown>>().notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const equipes = pgTable('equipes', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome'), // Opcional, ex: "Os Invencíveis"
  torneioId: uuid('torneio_id').references(() => torneios.id), // Equipe pode ser específica de um torneio ou global (a decidir)
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

// Tabela de ligação Equipe <-> Atletas (Muitos para Muitos)
export const equipeIntegrantes = pgTable('equipe_integrantes', {
  id: uuid('id').defaultRandom().primaryKey(),
  equipeId: uuid('equipe_id').references(() => equipes.id).notNull(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id).notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const inscricoes = pgTable('inscricoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  categoriaId: uuid('categoria_id').references(() => categorias.id).notNull(),
  equipeId: uuid('equipe_id').references(() => equipes.id).notNull(),
  status: statusInscricaoEnum('status').default('PENDENTE').notNull(),
  comprovanteUrl: text('comprovante_url'),
  dataInscricao: timestamp('data_inscricao').defaultNow().notNull(),
});

export const inscricaoPagamentos = pgTable('inscricao_pagamentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  inscricaoId: uuid('inscricao_id').references(() => inscricoes.id, { onDelete: "cascade" }).notNull(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  status: text('status').default('PENDENTE').notNull(),
  valorDevido: decimal('valor_devido', { precision: 10, scale: 2 }),
  pago: boolean('pago').default(false).notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
}, (t) => ({
  unq: unique().on(t.inscricaoId, t.usuarioId),
}));

export const torneioAtletaPrefs = pgTable(
  'torneio_atleta_prefs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    torneioId: uuid('torneio_id').references(() => torneios.id, { onDelete: "cascade" }).notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
    camisetaOpcao: text('camiseta_opcao'),
    criadoEm: timestamp('criado_em').defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
  },
  (t) => ({
    unq: unique().on(t.torneioId, t.usuarioId),
  })
);

export const grupos = pgTable('grupos', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoriaId: uuid('categoria_id').references(() => categorias.id).notNull(),
  nome: text('nome').notNull(), // "Grupo A", "Grupo B"
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const grupoEquipes = pgTable('grupo_equipes', {
  id: uuid('id').defaultRandom().primaryKey(),
  grupoId: uuid('grupo_id').references(() => grupos.id).notNull(),
  equipeId: uuid('equipe_id').references(() => equipes.id).notNull(),
  pontos: integer('pontos').default(0),
  jogosJogados: integer('jogos_jogados').default(0),
  jogosVencidos: integer('jogos_vencidos').default(0),
  jogosPerdidos: integer('jogos_perdidos').default(0),
  saldoGames: integer('saldo_games').default(0),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const rodadas = pgTable('rodadas', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  categoriaId: uuid('categoria_id').references(() => categorias.id), // Opcional, pode ser rodada global ou por categoria
  nome: text('nome').notNull(), // Ex: "Rodada 1", "Quartas de Final"
  numero: integer('numero'), // 1, 2, 3...
  dataInicio: timestamp('data_inicio'),
  dataFim: timestamp('data_fim'),
  dataLimite: timestamp('data_limite'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const arenas = pgTable('arenas', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  pointId: text('point_id'),
  nome: text('nome').notNull(),
  logoUrl: text('logo_url'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
}, (t) => ({
  unqPointTorneio: unique().on(t.torneioId, t.pointId),
}));

export const partidas = pgTable('partidas', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  categoriaId: uuid('categoria_id').references(() => categorias.id).notNull(),
  rodadaId: uuid('rodada_id').references(() => rodadas.id),
  grupoId: uuid('grupo_id').references(() => grupos.id), // Null se for mata-mata
  arenaId: uuid('arena_id').references(() => arenas.id),
  equipeAId: uuid('equipe_a_id').references(() => equipes.id).notNull(),
  equipeBId: uuid('equipe_b_id').references(() => equipes.id).notNull(),
  vencedorId: uuid('vencedor_id').references(() => equipes.id),
  
  placarA: integer('placar_a').default(0), // Sets vencidos
  placarB: integer('placar_b').default(0), // Sets vencidos
  
  // Detalhes do placar em JSON: [{set: 1, a: 6, b: 2}, {set: 2, a: 6, b: 4}]
  detalhesPlacar: json('detalhes_placar').$type<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[]>(),
  
  status: statusPartidaEnum('status').default('AGENDADA').notNull(),
  fase: faseTorneioEnum('fase').default('GRUPOS').notNull(),
  
  quadra: text('quadra'),
  dataHorario: timestamp('data_horario'),
  dataLimite: timestamp('data_limite'),
  iniciadoEm: timestamp('iniciado_em'),
  finalizadoEm: timestamp('finalizado_em'),
  observacoes: text('observacoes'),
  fotoUrl: text('foto_url'),
  transmissaoUrl: text('transmissao_url'),
  
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const gzappyConfig = pgTable('gzappy_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  ativo: boolean('ativo').default(false).notNull(),
  apiKey: text('api_key'),
  instanceId: text('instance_id'),
  whatsappArbitragem: text('whatsapp_arbitragem'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const placarSubmissoes = pgTable('placar_submissoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  partidaId: uuid('partida_id').references(() => partidas.id).notNull(),
  usuarioId: uuid('usuario_id').references(() => usuarios.id).notNull(),
  status: statusPlacarSubmissaoEnum('status').default('PENDENTE').notNull(),
  detalhesPlacar: json('detalhes_placar')
    .$type<{ set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[]>()
    .notNull(),
  placarA: integer('placar_a').notNull(),
  placarB: integer('placar_b').notNull(),
  vencedorId: uuid('vencedor_id').references(() => equipes.id),
  tokenHash: text('token_hash').notNull(),
  tokenExpiraEm: timestamp('token_expira_em'),
  confirmadoEm: timestamp('confirmado_em'),
  canceladoEm: timestamp('cancelado_em'),
  canceladoMotivo: text('cancelado_motivo'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const patrocinadores = pgTable('patrocinadores', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  nome: text('nome').notNull(),
  logoUrl: text('logo_url'),
  siteUrl: text('site_url'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const apoiadores = pgTable('apoiadores', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  nome: text('nome').notNull(),
  logoUrl: text('logo_url'),
  instagram: text('instagram'),
  slogan: text('slogan'),
  endereco: text('endereco'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  siteUrl: text('site_url'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});
