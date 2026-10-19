import OpenAI, { toFile } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { metasValidasAmericano } from "@/lib/americano";
import { locucaoConfigurada, sintetizarLocucao } from "@/lib/locucao-azure";
import { dataSP } from "@/services/presenca.service";
import { ErroSmart, calcularValorSmart, criarSmartTorneio, listarSmartDoCriador, obterConfigSmart } from "@/services/smart-torneio.service";

/**
 * Assistente de voz do Smart Torneio: a Thalita conversa com o atleta e monta o pedido.
 * O app grava a fala, manda aqui (audio ou texto) com o historico e o rascunho; a IA atualiza o
 * rascunho pelas ferramentas e, com a confirmacao do atleta, cria o pedido. Sem estado no servidor.
 */

export type RascunhoSmart = {
  nome?: string | null;
  data?: string | null; // YYYY-MM-DD
  horario?: string | null; // HH:MM
  local?: string | null;
  genero?: "MASCULINO" | "FEMININO" | "MISTO" | "LIVRE" | null;
  formato?: "AMERICANO" | "GRUPOS" | "MATA_MATA" | null;
  tipoParticipacao?: "DUPLAS" | "DUPLAS_SORTEADAS" | null;
  quantidadeAtletas?: number | null;
  jogosPorAtleta?: number | null;
  teste?: boolean | null;
  /** id do pedido depois de criado (nao cria de novo) */
  criadoId?: string | null;
};

export type MensagemAssistente = { role: "user" | "assistant"; content: string };

const MODELO = process.env.OPENAI_SMART_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const MODELO_TRANSCRICAO = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const MAX_HISTORICO = 20;
const MAX_RODADAS_FERRAMENTA = 4;
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

let cliente: OpenAI | null = null;
function openai() {
  const chave = (process.env.OPENAI_API_KEY || "").trim();
  if (!chave) throw new ErroSmart("Assistente indisponível: IA não configurada", 503);
  if (!cliente) cliente = new OpenAI({ apiKey: chave });
  return cliente;
}

/** Confere o rascunho: o que falta, avisos e valor. */
export async function avaliarRascunho(r: RascunhoSmart) {
  const config = await obterConfigSmart();
  const faltando: string[] = [];
  const avisos: string[] = [];
  if (!r.nome || r.nome.trim().length < 3) faltando.push("nome");
  if (!r.data) faltando.push("data");
  else if (r.data < dataSP()) avisos.push("A data já passou: peça outra data.");
  if (!r.local) faltando.push("local");
  if (!r.genero) faltando.push("genero");
  if (!r.formato) faltando.push("formato");
  if (r.formato && r.formato !== "AMERICANO" && !r.tipoParticipacao) faltando.push("tipoParticipacao");
  if (!r.quantidadeAtletas) faltando.push("quantidadeAtletas");
  if (r.formato === "AMERICANO" && !r.jogosPorAtleta) faltando.push("jogosPorAtleta");

  const n = r.quantidadeAtletas ?? 0;
  if (n && (n < 4 || n > 64)) avisos.push("A quantidade de atletas precisa ficar entre 4 e 64.");
  if (n && r.formato && r.formato !== "AMERICANO" && n % 2 !== 0) avisos.push("Em torneio de duplas a quantidade de atletas precisa ser par.");
  if (n && r.formato === "AMERICANO" && r.jogosPorAtleta && (n * r.jogosPorAtleta) % 4 !== 0) {
    const validas = metasValidasAmericano(n).filter((x) => x <= 10);
    avisos.push(`Com ${n} atletas não fecha ${r.jogosPorAtleta} jogos para cada um. Opções: ${validas.join(", ")} jogos por atleta.`);
  }

  const valor = n ? calcularValorSmart(n, config) : null;
  return {
    faltando,
    avisos,
    pronto: faltando.length === 0 && avisos.length === 0,
    valor,
    precoPorAtleta: config.valorPorAtleta,
    precoMinimo: config.valorMinimo,
  };
}

const FERRAMENTAS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "atualizar_rascunho",
      description:
        "Grava no rascunho o que o atleta informou (so os campos ditos agora). Devolve o rascunho, o que falta, avisos de regra e o valor. Chame sempre que o atleta der uma informacao.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do torneio" },
          data: { type: "string", description: "Data no formato AAAA-MM-DD" },
          horario: { type: "string", description: "Horario de inicio HH:MM (opcional)" },
          local: { type: "string", description: "Local / arena" },
          genero: { type: "string", enum: ["MASCULINO", "FEMININO", "MISTO", "LIVRE"] },
          formato: { type: "string", enum: ["AMERICANO", "GRUPOS", "MATA_MATA"] },
          tipoParticipacao: { type: "string", enum: ["DUPLAS", "DUPLAS_SORTEADAS"], description: "So para GRUPOS ou MATA_MATA" },
          quantidadeAtletas: { type: "integer", description: "Quantos atletas no total (4 a 64)" },
          jogosPorAtleta: { type: "integer", description: "Americano: jogos de cada atleta antes da final" },
          teste: { type: "boolean", description: "Torneio de teste (sem avisos aos atletas)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_smart_torneio",
      description:
        "Cria o pedido do Smart Torneio com o rascunho atual. So chame depois de ler o resumo para o atleta e ele confirmar claramente (sim, pode criar).",
      parameters: { type: "object", properties: { confirmado: { type: "boolean" } }, required: ["confirmado"], additionalProperties: false },
    },
  },
];

function promptSistema(params: { nomeAtleta: string; rascunho: RascunhoSmart; precoPorAtleta: number; precoMinimo: number }) {
  const hoje = dataSP();
  const diaSemana = DIAS[new Date(`${hoje}T12:00:00-03:00`).getDay()];
  const primeiroNome = params.nomeAtleta.trim().split(/\s+/)[0] || "atleta";
  return `Você é a Thalita, assistente de voz do Play na Quadra. Você conversa com ${primeiroNome} para criar um Smart Torneio de Beach Tennis: um torneio privado, de uma categoria, que ele organiza para os amigos.

Hoje é ${diaSemana}, ${hoje} (horário de Brasília). Converta datas faladas ("domingo que vem", "dia 25") para AAAA-MM-DD.

Sua fala vira áudio:
- Frases curtas e naturais, no máximo 2 frases e umas 35 palavras por resposta.
- Faça uma pergunta por vez. Nada de listas, markdown, emojis ou símbolos.
- Fale valores por extenso de forma natural ("quarenta reais") e datas como "domingo, dia 25".

O que você precisa descobrir (nesta ordem, sem repetir o que já está no rascunho):
1. Nome do torneio.
2. Data e, se ele quiser, horário de início.
3. Local (arena).
4. Gênero: masculino, feminino, misto ou livre.
5. Formato. Explique rápido se ele tiver dúvida:
   - Americano: cada um se inscreve sozinho e joga cada partida com um parceiro diferente, jogos até 4 games, ranking individual e final entre os 4 melhores. É o mais divertido para day use e ninguém fica preso a uma dupla. Recomende este quando ele não souber.
   - Grupos e mata-mata: duplas em grupos e depois chave eliminatória.
   - Só mata-mata: chave eliminatória direta.
   Nos dois últimos, pergunte se as duplas já vêm formadas ou se serão sorteadas.
6. Quantos atletas (4 a 64). Em duplas tem que ser par.
7. No Americano, quantos jogos cada atleta faz antes da final (sugira 4 a 6). Atletas vezes jogos precisa ser múltiplo de 4; se não fechar, ofereça as opções que a ferramenta devolver.

Preço: ${params.precoPorAtleta} reais por atleta, mínimo de ${params.precoMinimo} reais. O valor aparece quando a quantidade é informada; diga o valor ao confirmar.

Regras:
- Chame atualizar_rascunho sempre que ele informar algo, antes de responder.
- Quando nada faltar, leia um resumo curto (nome, data, local, formato, atletas e valor) e pergunte se pode criar.
- Só chame criar_smart_torneio depois de um sim claro.
- Depois de criado, diga que o pedido foi feito, que ele paga o Pix que aparece na tela e que, quando o Play na Quadra autorizar, ele recebe o código para os atletas se inscreverem.
- Se ele pedir para mudar algo, atualize e siga. Se ele falar de outro assunto, responda curto e volte ao torneio.
- Não invente regras, preços ou prazos além destes.

Rascunho atual: ${JSON.stringify(params.rascunho)}`;
}

function limparRascunho(atual: RascunhoSmart, novo: Record<string, unknown>): RascunhoSmart {
  const r: RascunhoSmart = { ...atual };
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
  if (texto(novo.nome)) r.nome = texto(novo.nome);
  if (typeof novo.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(novo.data)) r.data = novo.data;
  if (typeof novo.horario === "string" && /^\d{2}:\d{2}$/.test(novo.horario)) r.horario = novo.horario;
  if (texto(novo.local)) r.local = texto(novo.local);
  if (["MASCULINO", "FEMININO", "MISTO", "LIVRE"].includes(String(novo.genero))) r.genero = novo.genero as RascunhoSmart["genero"];
  if (["AMERICANO", "GRUPOS", "MATA_MATA"].includes(String(novo.formato))) r.formato = novo.formato as RascunhoSmart["formato"];
  if (["DUPLAS", "DUPLAS_SORTEADAS"].includes(String(novo.tipoParticipacao))) r.tipoParticipacao = novo.tipoParticipacao as RascunhoSmart["tipoParticipacao"];
  if (Number.isInteger(novo.quantidadeAtletas)) r.quantidadeAtletas = Number(novo.quantidadeAtletas);
  if (Number.isInteger(novo.jogosPorAtleta)) r.jogosPorAtleta = Math.max(1, Math.min(30, Number(novo.jogosPorAtleta)));
  if (typeof novo.teste === "boolean") r.teste = novo.teste;
  return r;
}

/** Transcreve a fala do atleta (audio gravado no app). */
export async function transcreverFala(audio: Buffer, mimeType: string) {
  const extensao = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
  const arquivo = await toFile(audio, `fala.${extensao}`, { type: mimeType || "audio/webm" });
  const pedir = (model: string) =>
    openai().audio.transcriptions.create({
      model,
      file: arquivo,
      language: "pt",
      prompt: "Smart Torneio de Beach Tennis, Americano, mata-mata, duplas sorteadas, arena, Play na Quadra.",
    });
  // se o modelo novo nao estiver liberado na conta, cai no whisper
  const r = await pedir(MODELO_TRANSCRICAO).catch(() => pedir("whisper-1"));
  return (r.text || "").trim();
}

/**
 * Um turno da conversa. `texto` (ou a transcricao do audio) e a fala do atleta; sem texto e sem
 * historico, a Thalita abre a conversa.
 */
export async function conversarAssistenteSmart(params: {
  usuarioId: string;
  nomeAtleta: string;
  texto: string | null;
  historico: MensagemAssistente[];
  rascunho: RascunhoSmart;
  comVoz: boolean;
}) {
  let rascunho: RascunhoSmart = { ...params.rascunho };
  const avaliacaoInicial = await avaliarRascunho(rascunho);
  const historico = params.historico
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORICO);
  const fala = params.texto?.trim() || (historico.length === 0 ? "(o atleta abriu o assistente; cumprimente pelo nome e pergunte o nome do torneio)" : "");
  if (!fala) throw new ErroSmart("Não entendi o que foi dito. Pode repetir?");

  const mensagens: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: promptSistema({ nomeAtleta: params.nomeAtleta, rascunho, precoPorAtleta: avaliacaoInicial.precoPorAtleta, precoMinimo: avaliacaoInicial.precoMinimo }),
    },
    ...historico.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
    { role: "user", content: fala },
  ];

  let pedido: Awaited<ReturnType<typeof listarSmartDoCriador>>[number] | null = null;
  let resposta = "";
  for (let rodada = 0; rodada <= MAX_RODADAS_FERRAMENTA; rodada++) {
    const r = await openai().chat.completions.create({
      model: MODELO,
      messages: mensagens,
      tools: FERRAMENTAS,
      temperature: 0.4,
    });
    const msg = r.choices[0]?.message;
    if (!msg) break;
    if (!msg.tool_calls?.length || rodada === MAX_RODADAS_FERRAMENTA) {
      resposta = (msg.content || "").trim();
      break;
    }
    mensagens.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const chamada of msg.tool_calls) {
      let saida: unknown;
      try {
        const args = JSON.parse(chamada.function.arguments || "{}");
        if (chamada.function.name === "atualizar_rascunho") {
          rascunho = limparRascunho(rascunho, args);
          saida = { rascunho, ...(await avaliarRascunho(rascunho)) };
        } else if (chamada.function.name === "criar_smart_torneio") {
          saida = await criarPeloAssistente(params.usuarioId, rascunho, args?.confirmado === true);
          if ((saida as { criado?: boolean }).criado) {
            const id = (saida as { id: string }).id;
            rascunho = { ...rascunho, criadoId: id };
            pedido = (await listarSmartDoCriador(params.usuarioId)).find((s) => s.id === id) ?? null;
          }
        } else {
          saida = { erro: "Ferramenta desconhecida" };
        }
      } catch (e: any) {
        saida = { erro: e?.message || "Falha ao executar" };
      }
      mensagens.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify(saida) });
    }
  }
  if (!resposta) resposta = "Desculpa, me perdi aqui. Pode repetir?";

  const novoHistorico: MensagemAssistente[] = [
    ...historico,
    ...(params.texto?.trim() ? [{ role: "user" as const, content: params.texto.trim() }] : []),
    { role: "assistant" as const, content: resposta },
  ].slice(-MAX_HISTORICO);

  let audioBase64: string | null = null;
  if (params.comVoz && locucaoConfigurada()) {
    audioBase64 = await sintetizarLocucao(resposta)
      .then((b) => b.toString("base64"))
      .catch(() => null);
  }

  return {
    resposta,
    historico: novoHistorico,
    rascunho,
    avaliacao: await avaliarRascunho(rascunho),
    pedido,
    audioBase64,
    audioMime: audioBase64 ? "audio/mpeg" : null,
  };
}

async function criarPeloAssistente(usuarioId: string, r: RascunhoSmart, confirmado: boolean) {
  if (r.criadoId) return { criado: false, erro: "Este torneio já foi criado nesta conversa." };
  if (!confirmado) return { criado: false, erro: "Peça a confirmação do atleta antes de criar." };
  const avaliacao = await avaliarRascunho(r);
  if (!avaliacao.pronto) return { criado: false, erro: "Ainda falta informação ou há regra a ajustar.", ...avaliacao };
  const pedido = await criarSmartTorneio({
    criadorUsuarioId: usuarioId,
    nome: r.nome!,
    data: r.data!,
    horario: r.horario ?? null,
    local: r.local!,
    genero: r.genero!,
    tipoParticipacao: r.formato === "AMERICANO" ? "DUPLAS" : r.tipoParticipacao!,
    formato: r.formato!,
    quantidadeAtletas: r.quantidadeAtletas!,
    jogosPorAtleta: r.jogosPorAtleta ?? undefined,
    teste: r.teste === true,
  });
  return { criado: true, id: pedido.id, codigo: pedido.codigo, valor: Number(pedido.valor) };
}
