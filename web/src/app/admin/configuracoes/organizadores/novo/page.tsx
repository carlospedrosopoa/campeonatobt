import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import OrganizerForm from "./OrganizerForm";

export default async function AdminNovoOrganizerPage() {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;

  if (perfil !== "ADMIN") {
    redirect("/admin");
  }

  return <OrganizerForm />;
}
