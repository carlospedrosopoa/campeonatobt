import { logout } from '@/lib/auth';
import { redirect } from 'next/navigation';

export async function POST() {
  await logout();
  redirect('/login');
}
