import { pgTable, serial, text, timestamp, boolean, uuid, integer, decimal, json, date, pgEnum, unique } from 'drizzle-orm/pg-core';

// Enums
export const perfilEnum = pgEnum('perfil_usuario', ['ADMIN', 'ORGANIZADOR', 'ATLETA']);
export const statusTorneioEnum = pgEnum('status_torneio', ['RASCUNHO', 'ABERTO', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO']);
export const statusPartidaEnum = pgEnum('status_partida', ['AGENDADA', 'EM_ANDAMENTO', 'FINALIZADA', 'WO', 'CANCELADA']);
export const faseTorneioEnum = pgEnum('fase_torneio', ['GRUPOS', 'OITAVAS', 'QUARTAS', 'SEMI', 'FINAL']);
export const statusInscricaoEnum = pgEnum('status_inscricao', ['PENDENTE', 'APROVADA', 'RECUSADA', 'FILA_ESPERA']);
export const generoCategoriaEnum = pgEnum('genero_categoria', ['MASCULINO', 'FEMININO', 'MISTO']);

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

export const torneios = pgTable('torneios', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  slug: text('slug').notNull().unique(),
  descricao: text('descricao'),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim').notNull(),
  local: text('local').notNull(),
  status: statusTorneioEnum('status').default('RASCUNHO').notNull(),
  superCampeonato: boolean('super_campeonato').default(false).notNull(),
  esporteId: uuid('esporte_id').references(() => esportes.id),
  organizadorId: uuid('organizador_id').references(() => usuarios.id).notNull(),
  bannerUrl: text('banner_url'),
  logoUrl: text('logo_url'),
  templateUrl: text('template_url'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});

export const categorias = pgTable('categorias', {
  id: uuid('id').defaultRandom().primaryKey(),
  torneioId: uuid('torneio_id').references(() => torneios.id).notNull(),
  nome: text('nome').notNull(), // Ex: "Mista C", "Feminina PRO"
  slug: text('slug').notNull(),
  genero: generoCategoriaEnum('genero').notNull(),
  valorInscricao: decimal('valor_inscricao', { precision: 10, scale: 2 }).default('0'), // Valor por atleta
  vagasMaximas: integer('vagas_maximas'),
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
  nome: text('nome').notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

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
  observacoes: text('observacoes'),
  fotoUrl: text('foto_url'),
  transmissaoUrl: text('transmissao_url'),
  
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
  slogan: text('slogan'),
  endereco: text('endereco'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  siteUrl: text('site_url'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em').defaultNow().notNull(),
});
