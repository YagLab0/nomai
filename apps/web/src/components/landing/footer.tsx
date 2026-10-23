import Link from 'next/link';

import { HillArt } from '@/components/landing/hills';

export function Footer() {
  return (
    <footer className="relative border-t border-sand">
      <HillArt
        palette={['var(--paper)', 'var(--terra-soft)', 'var(--terra)', 'var(--terra-deep)']}
        seed={6}
        className="h-24 w-full"
      />
      <div className="bg-terra-deep px-5 py-10 text-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-brand text-2xl font-semibold">nomai</p>
            <p className="mt-2 text-sm text-paper/75">Pagos en moneda local sobre infraestructura abierta</p>
          </div>
          <nav aria-label="Pie" className="flex gap-6 text-sm">
            <Link href="/login" className="hover:underline">Ingresar</Link>
            <Link href="/signup" className="hover:underline">Crear cuenta</Link>
            <a href="mailto:hola@nomai.app" className="hover:underline">hola@nomai.app</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
