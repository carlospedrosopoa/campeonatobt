import { cookies } from 'next/headers';
import { decrypt, encrypt } from './auth-token';

export { decrypt, encrypt };

export async function createSession(user: any) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const session = await encrypt({ user, expires });

  (await cookies()).set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires,
    sameSite: 'lax',
    path: '/',
  });
  return session;
}

export async function getSession() {
  const session = (await cookies()).get('session')?.value;
  if (!session) return null;
  try {
    return await decrypt(session);
  } catch (error) {
    return null;
  }
}

export async function getSessionFromToken(token: string) {
  try {
    return await decrypt(token);
  } catch {
    return null;
  }
}

export async function logout() {
  (await cookies()).set('session', '', { expires: new Date(0) });
}
