import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth";

export async function Navbar() {
  const session = await getSession();
  const perfil = session?.user?.perfil as string | undefined;
  const isAdmin = perfil === "ADMIN" || perfil === "ORGANIZADOR";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
          <Image src="/playnaquadra-logo.png" alt="Play Na Quadra" width={36} height={36} className="h-9 w-9 rounded-lg object-cover" />
          <span>Play Na Quadra - Competições</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/torneios" className="transition-colors hover:text-primary">
            Torneios
          </Link>
          <Link href="/atleta/torneios" className="transition-colors hover:text-primary">
            Área do Atleta
          </Link>
          {isAdmin && (
            <Link href="/admin" className="transition-colors hover:text-primary">
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-4">
          {session ? (
            <form action="/api/v1/auth/logout" method="post">
              <button type="submit" className="text-sm font-medium hover:underline underline-offset-4">
                Sair
              </button>
            </form>
          ) : (
            <>
              <Link href="/atleta/login" className="text-sm font-medium hover:underline underline-offset-4">
                Área do Atleta
              </Link>
              <Link 
                href="https://atleta.playnaquadra.com.br" 
                className="hidden md:inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                Criar Perfil
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
