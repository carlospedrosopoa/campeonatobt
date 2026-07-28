import { NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { equipeIntegrantes, equipes, inscricoes, torneioAtletaPrefs, torneios, usuarios } from "@/db/schema";
import { requireTournamentAdminBySlug } from "@/lib/torneio-admin-auth";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playBuscarAtletas, playGetAtletaById } from "@/services/playnaquadra-client";
import { extractCamisetaFromPlay } from "@/services/playnaquadra-camiseta";

const STATUS_INSCRICOES_ATIVAS = ["APROVADA", "PENDENTE", "FILA_ESPERA"] as const;

type AtletaRow = {
  atletaId: string;
  atletaNome: string;
  atletaEmail: string;
  atletaTelefone: string | null;
  atletaPlaynaquadraId: string | null;
  atletaCamiseta: string | null;
};

type PlayCandidate = {
  playnaquadraAtletaId: string | null;
  nome: string;
  email: string;
  telefone: string | null;
};

function normalizeOption(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function findMatch(opcoes: string[], value?: string | null) {
  const normalized = normalizeOption(value);
  if (!normalized) return null;
  const byLower = new Map(opcoes.map((item) => [normalizeOption(item).toLowerCase(), item]));
  return byLower.get(normalized.toLowerCase()) ?? null;
}

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function extractPlayCandidate(item: any): PlayCandidate | null {
  const playnaquadraAtletaId = String(item?.id || item?._id || item?.atletaId || item?.usuarioId || "").trim() || null;
  const nome = String(item?.nome || item?.usuario?.nome || item?.atleta?.nome || "").trim();
  const email = normalizeEmail(item?.email || item?.usuario?.email || item?.atleta?.email || "");
  const telefone = String(item?.telefone || item?.usuario?.telefone || item?.atleta?.telefone || "").trim() || null;

  if (!playnaquadraAtletaId && !nome && !email) return null;

  return {
    playnaquadraAtletaId,
    nome: nome || email || "Atleta",
    email,
    telefone,
  };
}

async function resolverMelhorMatchPlay(token: string, atleta: AtletaRow) {
  const queries = Array.from(
    new Set(
      [
        normalizeEmail(atleta.atletaEmail),
        normalizePhone(atleta.atletaTelefone),
        (() => {
          const phone = normalizePhone(atleta.atletaTelefone);
          return phone.length >= 8 ? phone.slice(-8) : "";
        })(),
        normalizeName(atleta.atletaNome),
      ].filter((value) => String(value || "").trim().length >= 2)
    )
  );

  if (!atleta.atletaPlaynaquadraId?.trim() && queries.length === 0) return null;

  const candidates: PlayCandidate[] = [];

  if (atleta.atletaPlaynaquadraId?.trim()) {
    const byId = await playGetAtletaById({ token, atletaId: atleta.atletaPlaynaquadraId.trim() });
    const parsedById = byId.res.ok ? extractPlayCandidate(byId.data) : null;
    if (parsedById) candidates.push(parsedById);
  }

  for (const query of queries) {
    const result = await playBuscarAtletas({ token, q: query, limite: 10 });
    if (!result.res.ok || !result.data) continue;

    const rawCandidates: any[] = Array.isArray(result.data?.atletas) ? result.data.atletas : Array.isArray(result.data) ? result.data : [];
    const parsed = rawCandidates
      .map<PlayCandidate | null>((item: any) => extractPlayCandidate(item))
      .filter((item): item is PlayCandidate => Boolean(item));

    candidates.push(...parsed);
  }

  const unique = new Map<string, PlayCandidate>();
  for (const candidate of candidates) {
    const key = String(candidate.playnaquadraAtletaId || candidate.email || candidate.nome || "").trim();
    if (!key || unique.has(key)) continue;
    unique.set(key, candidate);
  }

  const athleteEmail = normalizeEmail(atleta.atletaEmail);
  const athletePhone = normalizePhone(atleta.atletaTelefone);
  const athleteName = normalizeName(atleta.atletaNome);
  const ranked = Array.from(unique.values())
    .map((candidate) => {
      let score = 0;
      const candidateEmail = normalizeEmail(candidate.email);
      const candidatePhone = normalizePhone(candidate.telefone);
      const candidateName = normalizeName(candidate.nome);

      if (atleta.atletaPlaynaquadraId && candidate.playnaquadraAtletaId === atleta.atletaPlaynaquadraId) score += 200;
      if (athleteEmail && candidateEmail === athleteEmail) score += 120;
      if (athletePhone && candidatePhone === athletePhone) score += 120;
      if (athletePhone && candidatePhone && candidatePhone.endsWith(athletePhone.slice(-8))) score += 40;
      if (athleteName && candidateName === athleteName) score += 80;
      if (athleteName && candidateName && (candidateName.includes(athleteName) || athleteName.includes(candidateName))) score += 30;
      if (candidate.telefone) score += 20;
      if (candidate.playnaquadraAtletaId) score += 10;

      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.candidate ?? null;
  const bestScore = ranked[0]?.score ?? 0;
  if (!best || bestScore <= 0) return null;
  return best;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const acesso = await requireTournamentAdminBySlug(slug);
    if ("response" in acesso) return acesso.response;
    const { torneio } = acesso;

    const torneioRows = await db
      .select({ camisetaOpcoes: torneios.camisetaOpcoes })
      .from(torneios)
      .where(eq(torneios.id, torneio.id))
      .limit(1);

    const opcoes = Array.isArray(torneioRows[0]?.camisetaOpcoes)
      ? torneioRows[0]!.camisetaOpcoes.map((item) => String(item))
      : [];

    const rows = await db
      .select({
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaEmail: usuarios.email,
        atletaTelefone: usuarios.telefone,
        atletaPlaynaquadraId: usuarios.playnaquadraAtletaId,
        atletaCamiseta: torneioAtletaPrefs.camisetaOpcao,
      })
      .from(inscricoes)
      .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .leftJoin(torneioAtletaPrefs, and(eq(torneioAtletaPrefs.torneioId, torneio.id), eq(torneioAtletaPrefs.usuarioId, usuarios.id)))
      .where(and(eq(inscricoes.torneioId, torneio.id), inArray(inscricoes.status, [...STATUS_INSCRICOES_ATIVAS])));

    const atletasById = new Map<string, AtletaRow>();
    for (const row of rows) {
      if (!atletasById.has(row.atletaId)) {
        atletasById.set(row.atletaId, {
          atletaId: row.atletaId,
          atletaNome: row.atletaNome,
          atletaEmail: row.atletaEmail,
          atletaTelefone: row.atletaTelefone ?? null,
          atletaPlaynaquadraId: row.atletaPlaynaquadraId ?? null,
          atletaCamiseta: row.atletaCamiseta ?? null,
        });
      }
    }

    const atletas = Array.from(atletasById.values()).filter(
      (atleta) => !normalizeOption(atleta.atletaTelefone) || !normalizeOption(atleta.atletaCamiseta)
    );

    if (atletas.length === 0) {
      return NextResponse.json({
        ok: true,
        totalAnalisados: 0,
        telefonesAtualizados: 0,
        camisetasAtualizadas: 0,
      });
    }

    const token = await getPlayAdminToken();
    let telefonesAtualizados = 0;
    let camisetasAtualizadas = 0;

    for (const atleta of atletas) {
      const match = await resolverMelhorMatchPlay(token, atleta);
      const playId = match?.playnaquadraAtletaId || atleta.atletaPlaynaquadraId || null;
      const telefone = normalizeOption(match?.telefone) || null;

      const deveAtualizarTelefone = Boolean(telefone && !normalizeOption(atleta.atletaTelefone));
      let deveAtualizarPlayId = Boolean(!normalizeOption(atleta.atletaPlaynaquadraId) && normalizeOption(match?.playnaquadraAtletaId));

      if (deveAtualizarPlayId && match?.playnaquadraAtletaId) {
        const existing = await db
          .select({ id: usuarios.id })
          .from(usuarios)
          .where(and(eq(usuarios.playnaquadraAtletaId, match.playnaquadraAtletaId), ne(usuarios.id, atleta.atletaId)))
          .limit(1);

        if (existing.length > 0) {
          deveAtualizarPlayId = false;
        }
      }

      if (deveAtualizarTelefone || deveAtualizarPlayId) {
        const setData: Partial<typeof usuarios.$inferInsert> = {
          atualizadoEm: new Date(),
        };

        if (deveAtualizarTelefone) {
          setData.telefone = telefone;
        }

        if (deveAtualizarPlayId) {
          setData.playnaquadraAtletaId = match?.playnaquadraAtletaId || null;
        }

        await db.update(usuarios).set(setData).where(eq(usuarios.id, atleta.atletaId));

        if (deveAtualizarTelefone) {
          telefonesAtualizados += 1;
        }
      }

      if (!normalizeOption(atleta.atletaCamiseta) && playId) {
        const playData = await playGetAtletaById({ token, atletaId: playId });
        if (playData.res.ok) {
          const camisetaPlay = extractCamisetaFromPlay(playData.data);
          const camisetaMatch = opcoes.length > 0 ? findMatch(opcoes, camisetaPlay) : normalizeOption(camisetaPlay);

          if (camisetaMatch) {
            await db
              .insert(torneioAtletaPrefs)
              .values({
                torneioId: torneio.id,
                usuarioId: atleta.atletaId,
                camisetaOpcao: camisetaMatch,
                atualizadoEm: new Date(),
              })
              .onConflictDoUpdate({
                target: [torneioAtletaPrefs.torneioId, torneioAtletaPrefs.usuarioId],
                set: { camisetaOpcao: camisetaMatch, atualizadoEm: new Date() },
              });

            camisetasAtualizadas += 1;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      totalAnalisados: atletas.length,
      telefonesAtualizados,
      camisetasAtualizadas,
    });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Erro interno do servidor";
    console.error("Erro ao sincronizar dados dos atletas inscritos:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
