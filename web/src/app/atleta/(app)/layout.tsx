import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AtletaAppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;

  if (!session) redirect(`/atleta/login?next=${encodeURIComponent("/atleta/torneios")}`);
  if (perfil !== "ATLETA") redirect("/login");

  return <>{children}</>;
}

