import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { db } from "@/db";
import { arenas, categorias, equipeIntegrantes, partidas, usuarios, torneios } from "@/db/schema";
import { and, asc, eq, inArray, gte, lte, sql } from "drizzle-orm";
import { equipesDisplayService } from "@/services/equipes-display.service";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playBuscarAtletas, playGetAtletaById } from "@/services/playnaquadra-client";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

type SyncResult = {
  totalAtletas: number;
  totalComPlayId: number;
  atualizados: number;
  consultados: number;
  jaAtualizados: number;
  semFotoNoPlay: number;
  falhasConsulta: number;
};

function extrairFotoUrl(payload: any): string | null {
  const candidatos = [
    payload?.fotoUrl,
    payload?.foto,
    payload?.fotoPerfil,
    payload?.fotoPerfilUrl,
    payload?.avatar,
    payload?.avatarUrl,
    payload?.imagem,
    payload?.imagemUrl,
    payload?.profilePhoto,
    payload?.imageUrl,
    payload?.atleta?.fotoUrl,
    payload?.atleta?.foto,
    payload?.atleta?.fotoPerfil,
    payload?.atleta?.fotoPerfilUrl,
    payload?.usuario?.fotoUrl,
    payload?.usuario?.foto,
    payload?.usuario?.fotoPerfil,
    payload?.usuario?.fotoPerfilUrl,
    payload?.user?.fotoUrl,
    payload?.user?.foto,
    payload?.user?.fotoPerfil,
    payload?.user?.fotoPerfilUrl,
    payload?.data?.fotoUrl,
    payload?.data?.foto,
    payload?.data?.atleta?.fotoUrl,
    payload?.data?.usuario?.fotoUrl,
  ];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function extrairEmail(payload: any): string | null {
  const candidatos = [
    payload?.email,
    payload?.usuario?.email,
    payload?.user?.email,
    payload?.atleta?.email,
    payload?.data?.email,
    payload?.data?.usuario?.email,
    payload?.data?.atleta?.email,
  ];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c.trim().toLowerCase();
  }
  return null;
}

function normalizarTexto(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ymdSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeYmd(value: string | null) {
  const v = (value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return ymdSaoPaulo();
}

function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days, 0, 0, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function dataHorarioLocalDateSql(targetYmd: string) {
  return sql`timezone('America/Sao_Paulo', timezone('UTC', ${partidas.dataHorario}))::date = ${targetYmd}::date`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const dataStr = searchParams.get("data"); // YYYY-MM-DD
    const dataYmd = normalizeYmd(dataStr);

    const rows = await db
      .select({
        id: partidas.id,
        fase: partidas.fase,
        status: partidas.status,
        categoriaId: partidas.categoriaId,
        categoriaNome: categorias.nome,
        arenaNome: arenas.nome,
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
        dataHorario: partidas.dataHorario,
        quadra: partidas.quadra,
      })
      .from(partidas)
      .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
      .leftJoin(arenas, eq(partidas.arenaId, arenas.id))
      .where(
        and(
          eq(partidas.torneioId, torneio.id),
          dataHorarioLocalDateSql(dataYmd)
        )
      )
      .orderBy(asc(partidas.dataHorario));

    if (rows.length === 0) {
      return NextResponse.json({ 
        torneio,
        partidas: [] 
      });
    }

    const equipeIds = Array.from(new Set(rows.flatMap((r) => [r.equipeAId, r.equipeBId]).filter(Boolean))) as string[];
    const mapNomes = await equipesDisplayService.mapNomesEquipes(equipeIds);
    
    const atletasRows = await db
      .select({
        equipeId: equipeIntegrantes.equipeId,
        atletaId: usuarios.id,
        atletaNome: usuarios.nome,
        atletaFotoUrl: usuarios.fotoUrl,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));

    const mapAtletas = new Map<string, { id: string; nome: string; fotoUrl: string | null }[]>();
    for (const a of atletasRows) {
      const current = mapAtletas.get(a.equipeId) ?? [];
      current.push({ id: a.atletaId, nome: a.atletaNome, fotoUrl: a.atletaFotoUrl ?? null });
      mapAtletas.set(a.equipeId, current);
    }

    const partidasResult = rows.map((r) => ({
      ...r,
      equipeANome: mapNomes.get(r.equipeAId) ?? null,
      equipeBNome: mapNomes.get(r.equipeBId) ?? null,
      equipeAAtletas: r.equipeAId ? mapAtletas.get(r.equipeAId) ?? [] : [],
      equipeBAtletas: r.equipeBId ? mapAtletas.get(r.equipeBId) ?? [] : [],
    }));

    return NextResponse.json({
      torneio,
      partidas: partidasResult
    });
  } catch (error) {
    console.error("Erro ao listar jogos do dia:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const dataStr = searchParams.get("data"); // YYYY-MM-DD
    const dataYmd = normalizeYmd(dataStr);

    const rows = await db
      .select({
        equipeAId: partidas.equipeAId,
        equipeBId: partidas.equipeBId,
      })
      .from(partidas)
      .where(
        and(
          eq(partidas.torneioId, torneio.id),
          dataHorarioLocalDateSql(dataYmd)
        )
      );

    const equipeIds = Array.from(new Set(rows.flatMap((r) => [r.equipeAId, r.equipeBId]).filter(Boolean))) as string[];
    if (equipeIds.length === 0) {
      return NextResponse.json(
        {
          totalAtletas: 0,
          totalComPlayId: 0,
          atualizados: 0,
          consultados: 0,
          jaAtualizados: 0,
          semFotoNoPlay: 0,
          falhasConsulta: 0,
        } satisfies SyncResult,
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const atletas = await db
      .select({
        usuarioId: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        fotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(equipeIntegrantes)
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(inArray(equipeIntegrantes.equipeId, equipeIds));

    const porUsuario = new Map<string, { nome: string; email: string; fotoUrl: string | null; playId: string | null }>();
    for (const a of atletas) {
      if (!porUsuario.has(a.usuarioId)) {
        porUsuario.set(a.usuarioId, {
          nome: a.nome,
          email: a.email,
          fotoUrl: a.fotoUrl ?? null,
          playId: a.playnaquadraAtletaId ?? null,
        });
      }
    }

    const lista = Array.from(porUsuario.entries()).map(([usuarioId, value]) => ({
      usuarioId,
      nome: value.nome,
      email: value.email,
      fotoUrl: value.fotoUrl,
      playId: value.playId,
    }));

    const alvo = lista.filter((i) => i.playId);
    if (!alvo.length) {
      return NextResponse.json(
        {
          totalAtletas: lista.length,
          totalComPlayId: 0,
          atualizados: 0,
          consultados: 0,
          jaAtualizados: 0,
          semFotoNoPlay: 0,
          falhasConsulta: 0,
        } satisfies SyncResult,
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const token = await getPlayAdminToken();
    let atualizados = 0;
    let consultados = 0;
    let jaAtualizados = 0;
    let semFotoNoPlay = 0;
    let falhasConsulta = 0;

    for (const atleta of alvo) {
      try {
        consultados += 1;
        const { res, data } = await playGetAtletaById({ token, atletaId: atleta.playId as string });
        let fotoUrl = res.ok && data ? extrairFotoUrl(data) : null;
        if (!fotoUrl) {
          const termosBusca = [String(atleta.playId), atleta.email, atleta.nome].filter((v, i, arr) => !!v && arr.indexOf(v) === i);
          for (const termo of termosBusca) {
            const busca = await playBuscarAtletas({ token, q: termo, limite: 20 });
            if (!busca.res.ok || !busca.data) continue;
            const listaBusca = Array.isArray(busca.data?.atletas)
              ? busca.data.atletas
              : Array.isArray(busca.data)
                ? busca.data
                : [];
            const byId = listaBusca.find((x: any) => {
              const id = String(x?.id || x?._id || x?.atletaId || x?.usuarioId || "");
              return id === String(atleta.playId);
            });
            const byEmail = listaBusca.find((x: any) => extrairEmail(x) === atleta.email.toLowerCase());
            const byNome = listaBusca.find((x: any) => normalizarTexto(x?.nome || x?.usuario?.nome || x?.atleta?.nome) === normalizarTexto(atleta.nome));
            fotoUrl = extrairFotoUrl(byId || byEmail || byNome || listaBusca[0] || busca.data);
            if (fotoUrl) break;
          }
        }

        if (!fotoUrl) {
          semFotoNoPlay += 1;
          continue;
        }
        if (atleta.fotoUrl && atleta.fotoUrl.trim() === fotoUrl.trim()) {
          jaAtualizados += 1;
          continue;
        }

        await db.update(usuarios).set({ fotoUrl, atualizadoEm: new Date() }).where(eq(usuarios.id, atleta.usuarioId));
        atualizados += 1;
      } catch {
        falhasConsulta += 1;
        continue;
      }
    }

    return NextResponse.json(
      {
        totalAtletas: lista.length,
        totalComPlayId: alvo.length,
        atualizados,
        consultados,
        jaAtualizados,
        semFotoNoPlay,
        falhasConsulta,
      } satisfies SyncResult,
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao sincronizar fotos (jogos do dia):", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
