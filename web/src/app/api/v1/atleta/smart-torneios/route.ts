import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-request";
import { ErroSmart, criarSmartTorneio, listarSmartDoCriador, obterConfigSmart } from "@/services/smart-torneio.service";
import { TAMANHOS_RODIZIO_COMPLETO } from "@/lib/americano";
import { SISTEMAS_JOGO_SMART } from "@/lib/regras-partida";

const semCache = { "Cache-Control": "no-store", Vary: "Authorization" };

/** Meus Smart Torneios (criados por mim) e a tabela de preco para a tela de criacao. */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const [lista, config] = await Promise.all([listarSmartDoCriador(auth.user.id), obterConfigSmart()]);
  return NextResponse.json(
    {
      smartTorneios: lista,
      preco: { valorPorAtleta: config.valorPorAtleta, valorMinimo: config.valorMinimo, pixConfigurado: Boolean(config.pixChave) },
      // Americano com rodizio completo: quantidades de atletas que fecham (cada um joga quantidade - 1 jogos)
      rodizioCompleto: { tamanhos: TAMANHOS_RODIZIO_COMPLETO },
      // regras de jogo que o criador pode escolher (padrao: Americano ATE_4_SEM_TB, demais ATE_6_TB)
      sistemasJogo: Object.entries(SISTEMAS_JOGO_SMART).map(([id, s]) => ({ id, titulo: s.titulo })),
    },
    { headers: semCache }
  );
}

/** Cria o pedido. Body: { nome, data (AAAA-MM-DD), horario? (HH:MM), local, genero, tipoParticipacao, formato (GRUPOS | MATA_MATA | AMERICANO), quantidadeAtletas, jogosPorAtleta?, rodizioCompleto?, termino? (SEM_FINAL | FINAL | SEMIFINAL), sistemaJogo?, teste? } */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await request.json().catch(() => null)) ?? {};
    const pedido = await criarSmartTorneio({
      criadorUsuarioId: auth.user.id,
      nome: String(b.nome ?? ""),
      data: String(b.data ?? ""),
      horario: b.horario ? String(b.horario) : null,
      local: String(b.local ?? ""),
      genero: b.genero,
      tipoParticipacao: b.tipoParticipacao,
      formato: b.formato,
      jogosPorAtleta: b.jogosPorAtleta,
      rodizioCompleto: b.rodizioCompleto === true,
      semifinal: b.semifinal === true,
      termino: b.termino,
      sistemaJogo: b.sistemaJogo ?? undefined,
      teste: b.teste === true,
      quantidadeAtletas: Number(b.quantidadeAtletas),
    });
    const lista = await listarSmartDoCriador(auth.user.id);
    return NextResponse.json(lista.find((s) => s.id === pedido.id) ?? pedido, { status: 201, headers: semCache });
  } catch (e) {
    if (e instanceof ErroSmart) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Erro ao criar Smart Torneio:", e);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

