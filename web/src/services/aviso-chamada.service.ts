import { db } from "@/db";
import { categorias, grupos, partidas, smartTorneios, torneioComunicacoes, torneios } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { torneioComunicacoesService } from "@/services/torneio-comunicacoes.service";
import { NOME_FASE } from "@/services/operacao.service";

const nomeCurto = (nome: string) => {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] ?? "";
};

/**
 * Avisa os 4 atletas, pelo app (notificacoes) e pelo WhatsApp, que o jogo deles foi chamado.
 * So nos torneios com a operacao ao vivo ligada; no Smart Torneio (todos presentes) so pelo app. Nao repete o mesmo aviso dentro de 1 minuto.
 * Erros sao registrados e engolidos: a chamada do jogo nunca falha por causa do aviso.
 */
export async function avisarChamadaJogo(params: { torneioId: string; partidaId: string; criadoPorId: string }) {
  try {
    const [torneio] = await db
      .select({ id: torneios.id, nome: torneios.nome, operacaoAoVivo: torneios.operacaoAoVivo })
      .from(torneios)
      .where(eq(torneios.id, params.torneioId))
      .limit(1);
    if (!torneio?.operacaoAoVivo) return;

    const [jogo] = await db
      .select({
        id: partidas.id,
        status: partidas.status,
        quadra: partidas.quadra,
        chamadoEm: partidas.chamadoEm,
        fase: partidas.fase,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        grupoNome: grupos.nome,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .innerJoin(categorias, eq(categorias.id, partidas.categoriaId))
      .leftJoin(grupos, eq(grupos.id, partidas.grupoId))
      .where(and(eq(partidas.id, params.partidaId), eq(partidas.torneioId, params.torneioId)))
      .limit(1);
    if (!jogo || jogo.status !== "AGENDADA" || !jogo.chamadoEm) return;

    const atletas = await equipesDisplayService.mapAtletasEquipes([jogo.equipeAId, jogo.equipeBId], { categoriaId: jogo.categoriaId });
    const equipeA = atletas.get(jogo.equipeAId) ?? [];
    const equipeB = atletas.get(jogo.equipeBId) ?? [];
    const usuarioIds = [...equipeA, ...equipeB].map((a) => a.id);
    if (usuarioIds.length === 0) return;

    const quadraNumero = jogo.quadra?.match(/(\d+)/)?.[1] ?? null;
    const etapa = jogo.grupoNome || NOME_FASE[jogo.fase] || jogo.fase;
    const dupla = (lista: { nome: string }[]) => lista.map((a) => nomeCurto(a.nome)).join(" / ");
    const titulo = quadraNumero ? `Seu jogo foi chamado: Quadra ${quadraNumero}` : "Seu jogo foi chamado";
    const mensagem = [
      `${jogo.categoriaNome} · ${etapa}`,
      `${dupla(equipeA)} x ${dupla(equipeB)}`,
      quadraNumero ? `Dirija-se agora à Quadra ${quadraNumero}.` : "Apresente-se agora para o jogo.",
    ].join("\n");

    // nao repete o mesmo aviso (ex.: dois cliques seguidos)
    const [recente] = await db
      .select({ id: torneioComunicacoes.id })
      .from(torneioComunicacoes)
      .where(
        and(
          eq(torneioComunicacoes.torneioId, params.torneioId),
          eq(torneioComunicacoes.mensagem, mensagem),
          gte(torneioComunicacoes.criadoEm, new Date(Date.now() - 60_000))
        )
      )
      .limit(1);
    if (recente) return;

    const [smart] = await db.select({ id: smartTorneios.id }).from(smartTorneios).where(eq(smartTorneios.torneioId, torneio.id)).limit(1);

    await torneioComunicacoesService.criarComunicacao({
      torneioId: torneio.id,
      torneioNome: torneio.nome,
      criadoPorId: params.criadoPorId,
      categoriaId: jogo.categoriaId,
      titulo,
      mensagem,
      enviarWhatsapp: !smart,
      publicarNoApp: true,
      usuarioIds,
    });
  } catch (error) {
    console.error("[aviso-chamada] falha ao avisar os atletas", params.partidaId, error);
  }
}
