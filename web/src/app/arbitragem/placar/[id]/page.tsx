import { notFound } from "next/navigation";
import { db } from "@/db";
import { categorias, partidas, placarSubmissoes, torneios, usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sha256Hex } from "@/lib/token";
import { equipesDisplayService } from "@/services/equipes-display.service";
import ConfirmarPlacarClient from "./ConfirmarPlacarClient";

export default async function ArbitragemPlacarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  const tokenValue = (token || "").trim();
  if (!tokenValue) notFound();

  const subRows = await db
    .select({
      id: placarSubmissoes.id,
      partidaId: placarSubmissoes.partidaId,
      usuarioId: placarSubmissoes.usuarioId,
      status: placarSubmissoes.status,
      placarA: placarSubmissoes.placarA,
      placarB: placarSubmissoes.placarB,
      detalhesPlacar: placarSubmissoes.detalhesPlacar,
      tokenHash: placarSubmissoes.tokenHash,
      tokenExpiraEm: placarSubmissoes.tokenExpiraEm,
      criadoEm: placarSubmissoes.criadoEm,
    })
    .from(placarSubmissoes)
    .where(eq(placarSubmissoes.id, id))
    .limit(1);
  const sub = subRows[0];
  if (!sub) notFound();
  if (sub.tokenHash !== sha256Hex(tokenValue)) notFound();
  if (sub.status !== "PENDENTE") {
    return (
      <ConfirmarPlacarClient
        submissaoId={sub.id}
        token={tokenValue}
        titulo="Placar já processado"
        descricao="Este lançamento já foi confirmado ou cancelado."
        detalhes={[`Status: ${sub.status}`]}
      />
    );
  }
  if (sub.tokenExpiraEm && new Date(sub.tokenExpiraEm).getTime() < Date.now()) {
    return (
      <ConfirmarPlacarClient
        submissaoId={sub.id}
        token={tokenValue}
        titulo="Token expirado"
        descricao="Este link expirou. Solicite que o atleta envie novamente."
        detalhes={[]}
      />
    );
  }

  const partidaRows = await db
    .select({
      id: partidas.id,
      torneioNome: torneios.nome,
      categoriaNome: categorias.nome,
      equipeAId: partidas.equipeAId,
      equipeBId: partidas.equipeBId,
      dataHorario: partidas.dataHorario,
      quadra: partidas.quadra,
    })
    .from(partidas)
    .innerJoin(torneios, eq(partidas.torneioId, torneios.id))
    .innerJoin(categorias, eq(partidas.categoriaId, categorias.id))
    .where(eq(partidas.id, sub.partidaId))
    .limit(1);
  const partida = partidaRows[0];
  if (!partida) notFound();

  const nomesEquipes = await equipesDisplayService.mapNomesEquipes([partida.equipeAId, partida.equipeBId]);
  const equipeANome = nomesEquipes.get(partida.equipeAId) ?? "Equipe A";
  const equipeBNome = nomesEquipes.get(partida.equipeBId) ?? "Equipe B";

  const userRows = await db
    .select({ nome: usuarios.nome, email: usuarios.email, telefone: usuarios.telefone })
    .from(usuarios)
    .where(eq(usuarios.id, sub.usuarioId))
    .limit(1);
  const informante = userRows[0];

  const detalhes = [
    `Torneio: ${partida.torneioNome}`,
    `Categoria: ${partida.categoriaNome}`,
    `Jogo: ${equipeANome} x ${equipeBNome}`,
    `Resultado: ${sub.placarA} x ${sub.placarB}`,
    `Detalhes: ${sub.detalhesPlacar?.map((s) => `${s.a}-${s.b}`).join(" ") || "-"}`,
    `Data/Hora: ${partida.dataHorario ? new Date(partida.dataHorario).toLocaleString("pt-BR") : "-"}`,
    `Quadra: ${partida.quadra || "-"}`,
    `Informado por: ${informante?.nome || "-"} (${informante?.email || "-"})`,
    `Telefone: ${informante?.telefone || "-"}`,
  ];

  return (
    <ConfirmarPlacarClient
      submissaoId={sub.id}
      token={tokenValue}
      titulo="Confirmar placar"
      descricao="Confirme o placar informado pelo atleta, ou cancele o lançamento."
      detalhes={detalhes}
    />
  );
}

