import { randomInt } from "crypto";
import { db } from "@/db";
import { categorias, equipeIntegrantes, equipes, grupoEquipes, grupos, inscricaoPagamentos, inscricoes, partidas, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { categoriaConfigService } from "@/services/categoria-config.service";
import { resolverGeneroAtleta } from "@/services/inscricoes.service";

/**
 * Duplas sorteadas: cada atleta se inscreve sozinho (1 inscricao + 1 equipe de 1 atleta).
 * Formar a dupla = juntar duas inscricoes no mesmo formato de uma dupla normal:
 * a equipe da inscricao A recebe o atleta B e o pagamento de B passa para a inscricao A
 * (valor e "pago" preservados). Desfazer faz o caminho inverso.
 */

export class DuplasSorteadasError extends Error {}

type AtletaSorteio = { usuarioId: string; nome: string; genero: "MASCULINO" | "FEMININO" | null };
type InscricaoSorteio = { inscricaoId: string; equipeId: string; atletas: AtletaSorteio[] };

function embaralhar<T>(lista: T[]) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class DuplasSorteadasService {
  private async contexto(torneioId: string, categoriaId: string) {
    const [categoria] = await db
      .select({ id: categorias.id, nome: categorias.nome, genero: categorias.genero, torneioId: categorias.torneioId })
      .from(categorias)
      .where(eq(categorias.id, categoriaId))
      .limit(1);
    if (!categoria || categoria.torneioId !== torneioId) throw new DuplasSorteadasError("Categoria inválida para o torneio.");
    const config = await categoriaConfigService.obterOuDefault(categoriaId);
    if (config.tipoParticipacao !== "DUPLAS_SORTEADAS") {
      throw new DuplasSorteadasError("Esta categoria não é de duplas sorteadas. Ajuste o tipo de participação na Configuração.");
    }
    return categoria;
  }

  /** Depois de gerar grupos ou jogos as duplas ficam travadas (os jogos usam as equipes). */
  private async travada(categoriaId: string) {
    const [jogo] = await db.select({ id: partidas.id }).from(partidas).where(eq(partidas.categoriaId, categoriaId)).limit(1);
    if (jogo) return true;
    const [grupo] = await db
      .select({ id: grupoEquipes.id })
      .from(grupoEquipes)
      .innerJoin(grupos, eq(grupos.id, grupoEquipes.grupoId))
      .where(eq(grupos.categoriaId, categoriaId))
      .limit(1);
    return Boolean(grupo);
  }

  /** Inscricoes aprovadas da categoria com seus atletas (1 = avulso, 2 = dupla formada). */
  private async inscricoesAprovadas(categoriaId: string, comGenero: boolean): Promise<InscricaoSorteio[]> {
    const rows = await db
      .select({
        inscricaoId: inscricoes.id,
        equipeId: inscricoes.equipeId,
        usuarioId: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
        dataInscricao: inscricoes.dataInscricao,
      })
      .from(inscricoes)
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, inscricoes.equipeId))
      .innerJoin(usuarios, eq(usuarios.id, equipeIntegrantes.usuarioId))
      .where(and(eq(inscricoes.categoriaId, categoriaId), eq(inscricoes.status, "APROVADA")));

    const generoPorUsuario = new Map<string, "MASCULINO" | "FEMININO" | null>();
    if (comGenero) {
      const unicos = Array.from(new Map(rows.map((r) => [r.usuarioId, r])).values());
      const resolvidos = await Promise.all(
        unicos.map(async (r) => {
          try {
            const g = await resolverGeneroAtleta({ nome: r.nome, email: r.email, telefone: r.telefone, playnaquadraAtletaId: r.playnaquadraAtletaId });
            return [r.usuarioId, g.genero === "MASCULINO" || g.genero === "FEMININO" ? g.genero : null] as const;
          } catch {
            return [r.usuarioId, null] as const;
          }
        }),
      );
      for (const [id, g] of resolvidos) generoPorUsuario.set(id, g);
    }

    const porInscricao = new Map<string, InscricaoSorteio & { data: number }>();
    for (const r of rows) {
      const item = porInscricao.get(r.inscricaoId) ?? { inscricaoId: r.inscricaoId, equipeId: r.equipeId, atletas: [], data: new Date(r.dataInscricao).getTime() };
      if (!item.atletas.some((a) => a.usuarioId === r.usuarioId)) {
        item.atletas.push({ usuarioId: r.usuarioId, nome: r.nome, genero: generoPorUsuario.get(r.usuarioId) ?? null });
      }
      porInscricao.set(r.inscricaoId, item);
    }
    return Array.from(porInscricao.values())
      .sort((a, b) => a.data - b.data)
      .map(({ data: _d, ...resto }) => resto);
  }

  async estado(params: { torneioId: string; categoriaId: string }) {
    const categoria = await this.contexto(params.torneioId, params.categoriaId);
    const misto = categoria.genero === "MISTO";
    const [lista, travada, pendentes] = await Promise.all([
      this.inscricoesAprovadas(params.categoriaId, misto),
      this.travada(params.categoriaId),
      db
        .select({ id: inscricoes.id })
        .from(inscricoes)
        .where(and(eq(inscricoes.categoriaId, params.categoriaId), eq(inscricoes.status, "PENDENTE"))),
    ]);
    const avulsos = lista.filter((i) => i.atletas.length === 1);
    const duplas = lista.filter((i) => i.atletas.length >= 2);
    const homens = avulsos.filter((i) => i.atletas[0].genero === "MASCULINO").length;
    const mulheres = avulsos.filter((i) => i.atletas[0].genero === "FEMININO").length;
    const semGenero = misto ? avulsos.filter((i) => !i.atletas[0].genero).map((i) => i.atletas[0].nome) : [];
    return {
      categoria: { id: categoria.id, nome: categoria.nome, genero: categoria.genero },
      travada,
      pendentes: pendentes.length,
      avulsos,
      duplas,
      resumo: { avulsos: avulsos.length, duplas: duplas.length, homens, mulheres, semGenero },
      impedimento: this.impedimentoSorteio({ travada, misto, avulsos: avulsos.length, homens, mulheres, semGenero }),
    };
  }

  private impedimentoSorteio(p: { travada: boolean; misto: boolean; avulsos: number; homens: number; mulheres: number; semGenero: string[] }) {
    if (p.travada) return "Os grupos ou jogos desta categoria já foram gerados. Para mexer nas duplas, apague os jogos e grupos na Configuração.";
    if (p.avulsos === 0) return "Não há atletas aprovados sem dupla.";
    if (p.avulsos % 2 !== 0) return `O número de atletas sem dupla precisa ser par (hoje são ${p.avulsos}).`;
    if (p.misto) {
      if (p.semGenero.length) return `Não foi possível identificar o gênero de: ${p.semGenero.join(", ")}. Atualize o perfil no Play na Quadra.`;
      if (p.homens !== p.mulheres) return `Categoria mista: o número de homens e mulheres sem dupla precisa ser igual (hoje ${p.homens} homens e ${p.mulheres} mulheres).`;
    }
    return null;
  }

  /** Sorteia as duplas entre os atletas aprovados que ainda nao tem dupla (duplas ja formadas sao mantidas). */
  async sortear(params: { torneioId: string; categoriaId: string }) {
    const e = await this.estado(params);
    if (e.impedimento) throw new DuplasSorteadasError(e.impedimento);
    let pares: Array<[InscricaoSorteio, InscricaoSorteio]> = [];
    if (e.categoria.genero === "MISTO") {
      const h = embaralhar(e.avulsos.filter((i) => i.atletas[0].genero === "MASCULINO"));
      const m = embaralhar(e.avulsos.filter((i) => i.atletas[0].genero === "FEMININO"));
      pares = h.map((x, idx) => [x, m[idx]] as [InscricaoSorteio, InscricaoSorteio]);
    } else {
      const todos = embaralhar(e.avulsos);
      for (let i = 0; i < todos.length; i += 2) pares.push([todos[i], todos[i + 1]]);
    }
    await db.transaction(async (tx) => {
      for (const [a, b] of pares) await this.juntar(tx, a, b);
    });
    return this.estado(params);
  }

  /** Forma uma dupla escolhida pelo organizador. */
  async formarManual(params: { torneioId: string; categoriaId: string; inscricaoAId: string; inscricaoBId: string }) {
    const categoria = await this.contexto(params.torneioId, params.categoriaId);
    if (await this.travada(params.categoriaId)) {
      throw new DuplasSorteadasError("Os grupos ou jogos desta categoria já foram gerados. Para mexer nas duplas, apague os jogos e grupos na Configuração.");
    }
    if (params.inscricaoAId === params.inscricaoBId) throw new DuplasSorteadasError("Escolha dois atletas diferentes.");
    const lista = await this.inscricoesAprovadas(params.categoriaId, categoria.genero === "MISTO");
    const a = lista.find((i) => i.inscricaoId === params.inscricaoAId);
    const b = lista.find((i) => i.inscricaoId === params.inscricaoBId);
    if (!a || !b || a.atletas.length !== 1 || b.atletas.length !== 1) {
      throw new DuplasSorteadasError("Os dois atletas precisam estar aprovados e sem dupla.");
    }
    if (categoria.genero === "MISTO" && (!a.atletas[0].genero || !b.atletas[0].genero || a.atletas[0].genero === b.atletas[0].genero)) {
      throw new DuplasSorteadasError("Categoria mista: a dupla precisa ter um homem e uma mulher.");
    }
    await db.transaction(async (tx) => {
      await this.juntar(tx, a, b);
    });
    return this.estado(params);
  }

  /** Desfaz uma dupla (os dois voltam a ser atletas sem dupla). */
  async desfazer(params: { torneioId: string; categoriaId: string; inscricaoId?: string | null; todas?: boolean }) {
    await this.contexto(params.torneioId, params.categoriaId);
    if (await this.travada(params.categoriaId)) {
      throw new DuplasSorteadasError("Os grupos ou jogos desta categoria já foram gerados. Para mexer nas duplas, apague os jogos e grupos na Configuração.");
    }
    const lista = await this.inscricoesAprovadas(params.categoriaId, false);
    const alvo = params.todas ? lista.filter((i) => i.atletas.length >= 2) : lista.filter((i) => i.inscricaoId === params.inscricaoId && i.atletas.length >= 2);
    if (alvo.length === 0) throw new DuplasSorteadasError("Nenhuma dupla para desfazer.");
    await db.transaction(async (tx) => {
      for (const dupla of alvo) await this.separar(tx, params.torneioId, params.categoriaId, dupla);
    });
    return this.estado(params);
  }

  private async juntar(tx: any, a: InscricaoSorteio, b: InscricaoSorteio) {
    const atletaB = b.atletas[0];
    await tx.insert(equipeIntegrantes).values({ equipeId: a.equipeId, usuarioId: atletaB.usuarioId });
    // sem nome fixo: as telas mostram "Fulano/Ciclano"
    await tx.update(equipes).set({ nome: null }).where(eq(equipes.id, a.equipeId));
    await tx.update(inscricaoPagamentos).set({ inscricaoId: a.inscricaoId }).where(eq(inscricaoPagamentos.inscricaoId, b.inscricaoId));
    await tx.delete(inscricoes).where(eq(inscricoes.id, b.inscricaoId));
    await tx.delete(equipeIntegrantes).where(eq(equipeIntegrantes.equipeId, b.equipeId));
    await tx.delete(equipes).where(eq(equipes.id, b.equipeId));
  }

  private async separar(tx: any, torneioId: string, categoriaId: string, dupla: InscricaoSorteio) {
    const [equipe] = await tx.select({ capitao: equipes.capitaoUsuarioId }).from(equipes).where(eq(equipes.id, dupla.equipeId)).limit(1);
    // quem sai e o atleta que nao e o capitao (o dono original da inscricao fica)
    const sai = dupla.atletas.find((x) => x.usuarioId !== equipe?.capitao) ?? dupla.atletas[dupla.atletas.length - 1];
    const [novaEquipe] = await tx.insert(equipes).values({ torneioId, nome: null, capitaoUsuarioId: sai.usuarioId }).returning({ id: equipes.id });
    await tx.insert(equipeIntegrantes).values({ equipeId: novaEquipe.id, usuarioId: sai.usuarioId });
    const [novaInscricao] = await tx
      .insert(inscricoes)
      .values({ torneioId, categoriaId, equipeId: novaEquipe.id, status: "APROVADA" })
      .returning({ id: inscricoes.id });
    await tx
      .update(inscricaoPagamentos)
      .set({ inscricaoId: novaInscricao.id })
      .where(and(eq(inscricaoPagamentos.inscricaoId, dupla.inscricaoId), eq(inscricaoPagamentos.usuarioId, sai.usuarioId)));
    await tx.delete(equipeIntegrantes).where(and(eq(equipeIntegrantes.equipeId, dupla.equipeId), eq(equipeIntegrantes.usuarioId, sai.usuarioId)));
  }
}

export const duplasSorteadasService = new DuplasSorteadasService();

