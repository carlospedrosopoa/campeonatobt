import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import OrganizerEditForm from "./OrganizerEditForm";

export default async function AdminEditarOrganizerPage({
  params,
}: {
  params: Promise<{ organizerId: string }>;
}) {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;

  if (perfil !== "ADMIN") {
    redirect("/admin");
  }

  const { organizerId } = await params;
  return <OrganizerEditForm organizerId={organizerId} />;
}
