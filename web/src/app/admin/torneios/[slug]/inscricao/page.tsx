podeimport { db } from "@/db";
import { tournaments, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { InscricaoForm } from "./Form";

export default async function AdminInscricaoPage({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;

  // Buscar dados do torneio
  const tournamentResult = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);

  const tournament = tournamentResult[0];

  if (!tournament) {
    notFound();
  }

  // Buscar categorias
  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.tournamentId, tournament.id));

  return (
    <InscricaoForm 
      tournament={tournament} 
      categories={cats} 
      slug={slug} 
    />
  );
}
