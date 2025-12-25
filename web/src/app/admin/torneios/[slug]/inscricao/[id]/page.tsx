import { db } from "@/db";
import { tournaments, categories, registrations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EdicaoInscricaoForm } from "./Form";

export default async function AdminEdicaoInscricaoPage({ 
  params 
}: { 
  params: Promise<{ slug: string; id: string }> 
}) {
  const { slug, id } = await params;

  // 1. Buscar Inscrição com os dados dos atletas
  // Como não temos relations, fazemos manual
  const regResult = await db.select().from(registrations).where(eq(registrations.id, id)).limit(1);
  const registration = regResult[0];

  if (!registration) notFound();

  // Buscar detalhes dos atletas
  const p1 = await db.select().from(users).where(eq(users.id, registration.player1Id)).limit(1);
  const p2 = await db.select().from(users).where(eq(users.id, registration.player2Id || "")).limit(1);

  const registrationWithUsers = {
    ...registration,
    player1: p1[0],
    player2: p2[0]
  };

  // 2. Buscar Torneio e Categorias (para o contexto do form)
  const tournamentResult = await db.select().from(tournaments).where(eq(tournaments.slug, slug)).limit(1);
  const tournament = tournamentResult[0];

  if (!tournament) notFound();

  const cats = await db.select().from(categories).where(eq(categories.tournamentId, tournament.id));

  return (
    <EdicaoInscricaoForm 
      registration={registrationWithUsers}
      tournament={tournament}
      categories={cats}
      slug={slug}
    />
  );
}
