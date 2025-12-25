"use server";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createCategory(data: {
  tournamentId: string;
  name: string;
  price: number;
  maxPairs: number;
}) {
  try {
    await db.insert(categories).values({
      tournamentId: data.tournamentId,
      name: data.name,
      price: data.price.toString(),
      maxPairs: data.maxPairs,
    });
    revalidatePath("/admin/torneios");
    return { success: true };
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    return { success: false, message: "Erro ao criar categoria" };
  }
}

export async function deleteCategory(categoryId: string) {
  try {
    // Verificar se tem inscrições antes? Por enquanto, constraint do banco vai barrar se tiver.
    await db.delete(categories).where(eq(categories.id, categoryId));
    revalidatePath("/admin/torneios");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
    return { success: false, message: "Não é possível excluir categoria com inscrições vinculadas." };
  }
}
