import type { Metadata } from 'next';

import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = { title: 'Ingresar · nomai' };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
