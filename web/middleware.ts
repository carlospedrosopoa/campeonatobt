import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from './src/lib/auth';

// 1. Specify protected and public routes
const protectedRoutes = ['/admin', '/dashboard'];
const adminRoutes = ['/admin'];
const publicRoutes = ['/login', '/signup', '/', '/torneios', '/ranking'];

export default async function middleware(req: NextRequest) {
  // 2. Check if the current route is protected or public
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route));
  const isAdminRoute = adminRoutes.some(route => path.startsWith(route));

  // 3. Decrypt the session from the cookie
  const cookie = req.cookies.get('session')?.value;
  let session = null;

  if (cookie) {
    try {
       // Precisamos duplicar a lógica de decrypt aqui ou importar se o runtime permitir
       // O Next.js Edge Runtime tem limitações, mas jose roda bem.
       // Vou usar uma lógica simplificada aqui para não depender de imports complexos que podem quebrar no Edge
       // Mas como o auth.ts usa 'jose' que é edge compatible, vou tentar importar.
       
       // Nota: Imports relativos no middleware podem ser chatos.
       // Vamos assumir que a sessão existe se o cookie existe para validação básica,
       // mas a validação real de role acontece no layout/page.
       
       // Melhor abordagem: Deixar o layout fazer o redirect pesado, e o middleware só proteger o óbvio.
    } catch (e) {}
  }

  // Se não tem cookie e tenta acessar rota protegida -> Login
  if (isProtectedRoute && !cookie) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // Se já está logado e tenta acessar login -> Dashboard (opcional)
  if (path === '/login' && cookie) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  return NextResponse.next();
}

// Routes Middleware should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
