import { redirect } from "next/navigation";
import { Barlow_Semi_Condensed, Manrope } from "next/font/google";
import { getSession } from "@/lib/auth";
import { AdminShell } from "@/components/admin/shell/admin-shell";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const barlow = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;
  const permitido = perfil === "ADMIN" || perfil === "ORGANIZADOR";
  const isAdmin = perfil === "ADMIN";

  if (!permitido) {
    redirect(`/login?next=${encodeURIComponent("/admin")}`);
  }

  return (
    <div className={`${manrope.variable} ${barlow.variable}`}>
      <AdminShell usuario={{ nome: (session?.user?.nome as string | undefined) ?? null, perfil: perfil ?? null }} isAdmin={isAdmin}>
        {children}
      </AdminShell>
    </div>
  );
}
