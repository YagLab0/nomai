import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono, Readex_Pro } from 'next/font/google';
import './globals.css';

import { Navbar } from '@/components/navbar';

const sans = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});
const readex = Readex_Pro({
  subsets: ['latin'],
  variable: '--font-readex-pro',
});

export const metadata: Metadata = {
  title: 'nomai — tu agente de viajes en tu moneda',
  description:
    'El agente de IA que busca, negocia y paga tu hospedaje en stablecoins locales sobre Celo. Sin tarjeta, sin dólar tarjeta, sin espera.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${sans.variable} ${mono.variable} ${readex.variable} font-sans`}
      >
        <div className="relative flex min-h-screen flex-col">
          <Navbar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
