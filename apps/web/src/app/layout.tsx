import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono, Fraunces } from 'next/font/google';
import './globals.css';

const sans = Space_Grotesk({ subsets: ['latin'], variable: '--font-nm-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-nm-mono' });
const brand = Fraunces({
  subsets: ['latin'],
  axes: ['opsz', 'SOFT'],
  variable: '--font-nm-brand',
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
      <body className={`${sans.variable} ${mono.variable} ${brand.variable} font-sans`}>
        <div className="relative flex min-h-screen flex-col">
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
