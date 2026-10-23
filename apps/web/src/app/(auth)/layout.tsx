import Link from 'next/link';

import { NomitoAvatar } from '@/components/nomito-avatar';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-paper text-ink lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link
          href="/"
          className="font-brand text-2xl font-semibold tracking-tight text-terra-deep outline-none focus-visible:ring-2 focus-visible:ring-terra"
        >
          nomai
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {children}
        </div>
      </div>

      <aside
        aria-hidden="true"
        className="relative hidden flex-col items-center justify-center gap-6 overflow-hidden bg-terra px-12 text-center text-paper lg:flex"
      >
        <div className="absolute -bottom-24 -left-16 h-72 w-[130%] rotate-[-6deg] rounded-[50%] bg-terra-deep/50" />
        <div className="absolute -bottom-40 -right-24 h-72 w-[120%] rotate-[4deg] rounded-[50%] bg-terra-deep/70" />
        <div className="relative flex flex-col items-center gap-6">
          <NomitoAvatar size="lg" className="bg-paper text-terra ring-0" />
          <h2 className="max-w-xs font-brand text-4xl font-medium leading-tight">
            Contale tu viaje a Nomito
          </h2>
          <p className="max-w-xs text-lg leading-relaxed text-paper/80">
            Dónde, cuándo y con cuánto. Él busca, compara y se ocupa del resto.
          </p>
        </div>
      </aside>
    </div>
  );
}
