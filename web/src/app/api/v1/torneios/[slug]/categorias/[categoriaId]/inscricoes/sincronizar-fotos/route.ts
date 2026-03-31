import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { categoriasService } from "@/services/categorias.service";
import { db } from "@/db";
import { equipeIntegrantes, equipes, inscricoes, usuarios } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPlayAdminToken } from "@/services/playnaquadra-admin-token";
import { playBuscarAtletas, playGetAtletaById } from "@/services/playnaquadra-client";

function isAdmin(perfil?: string) {
  return perfil === "ADMIN" || perfil === "ORGANIZADOR";
}

type SyncResult = {
  totalInscritos: number;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; categoriaId: string }> }
) {
  try {
    const session = await getSession();
    const perfil = session?.user?.perfil as string | undefined;
    if (!isAdmin(perfil)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { slug, categoriaId } = await params;
    const torneio = await torneiosService.buscarPorSlug(slug);
    if (!torneio) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const categoria = await categoriasService.buscarPorId(categoriaId);
    if (!categoria || categoria.torneioId !== torneio.id) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const rows = await db
      .select({
        usuarioId: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        fotoUrl: usuarios.fotoUrl,
        playnaquadraAtletaId: usuarios.playnaquadraAtletaId,
      })
      .from(inscricoes)
      .innerJoin(equipes, eq(inscricoes.equipeId, equipes.id))
      .innerJoin(equipeIntegrantes, eq(equipeIntegrantes.equipeId, equipes.id))
      .innerJoin(usuarios, eq(equipeIntegrantes.usuarioId, usuarios.id))
      .where(and(eq(inscricoes.torneioId, torneio.id), eq(inscricoes.categoriaId, categoriaId)));

    const porUsuario = new Map<string, { nome: string; email: string; fotoUrl: string | null; playId: string | null }>();
    for (const r of rows) {
      if (!porUsuario.has(r.usuarioId)) {
        porUsuario.set(r.usuarioId, {
          nome: r.nome,
          email: r.email,
          fotoUrl: r.fotoUrl ?? null,
          playId: r.playnaquadraAtletaId ?? null,
        });
      }
    }

    const inscritos = Array.from(porUsuario.entries()).map(([usuarioId, value]) => ({
      usuarioId,
      nome: value.nome,
      email: value.email,
      fotoUrl: value.fotoUrl,
      playId: value.playId,
    }));

    const alvo = inscritos.filter((i) => i.playId);
    if (!alvo.length) {
      return NextResponse.json(
        {
          totalInscritos: inscritos.length,
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
            const lista = Array.isArray(busca.data?.atletas)
              ? busca.data.atletas
              : Array.isArray(busca.data)
                ? busca.data
                : [];
            const byId = lista.find((x: any) => {
              const id = String(x?.id || x?._id || x?.atletaId || x?.usuarioId || "");
              return id === String(atleta.playId);
            });
            const byEmail = lista.find((x: any) => extrairEmail(x) === atleta.email.toLowerCase());
            const byNome = lista.find((x: any) => normalizarTexto(x?.nome || x?.usuario?.nome || x?.atleta?.nome) === normalizarTexto(atleta.nome));
            fotoUrl = extrairFotoUrl(byId || byEmail || byNome || lista[0] || busca.data);
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

        await db
          .update(usuarios)
          .set({ fotoUrl, atualizadoEm: new Date() })
          .where(eq(usuarios.id, atleta.usuarioId));
        atualizados += 1;
      } catch {
        falhasConsulta += 1;
        continue;
      }
    }

    return NextResponse.json(
      {
        totalInscritos: inscritos.length,
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
    console.error("Erro ao sincronizar fotos dos inscritos:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
