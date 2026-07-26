import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { getAppAtletaUrl } from "@/lib/app-atleta-url";

export default async function AtletaAppLayout({ children }: { children: ReactNode }) {
  void children;
  redirect(getAppAtletaUrl());
}

