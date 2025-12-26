"use server";

import { db } from "@/db";
import { sponsors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createSponsor(data: {
  tournamentId: string;
  name: string;
  address?: string;
  instagram?: string;
  website?: string;
  logoUrl?: string;
  bannerUrl?: string;
}) {
  try {
    await db.insert(sponsors).values({
      tournamentId: data.tournamentId,
      name: data.name,
      address: data.address,
      instagram: data.instagram,
      website: data.website,
      logoUrl: data.logoUrl,
      bannerUrl: data.bannerUrl,
    });
    return { success: true };
  } catch (error) {
    console.error("Erro ao criar apoiador:", error);
    return { success: false, message: "Erro ao criar apoiador." };
  }
}

export async function deleteSponsor(id: string) {
  try {
    await db.delete(sponsors).where(eq(sponsors.id, id));
    return { success: true };
  } catch (error) {
    console.error("Erro ao deletar apoiador:", error);
    return { success: false, message: "Erro ao deletar apoiador." };
  }
}
