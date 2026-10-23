import Link from 'next/link';

import { NomitoAvatar } from '@/components/nomito-avatar';

export function Footer() {
  return (
    <footer className="px-4 sm:px-5">
      <div className="mx-auto max-w-7xl rounded-t-panel bg-terra-deep px-6 pb-10 pt-12 text-paper sm:px-10 lg:px-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2.5 font-brand text-2xl font-semibold">
              <NomitoAvatar size="sm" shape="icon" decorative className="bg-paper" />
              nomai
            </p>
            <p className="mt-3 text-sm text-paper/75">Pagos en moneda local sobre infraestructura abierta</p>
          </div>
          <nav aria-label="Pie" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/lodgings" className="hover:underline">Alojamientos</Link>
            <Link href="/login" className="hover:underline">Ingresar</Link>
            <Link href="/signup" className="hover:underline">Crear cuenta</Link>
            <a href="mailto:hola@nomai.app" className="hover:underline">hola@nomai.app</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
