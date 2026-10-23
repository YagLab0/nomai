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
  title: 'nomai — Nomito arma tu viaje al Norte',
  description:
    'Contale a Nomito a dónde querés ir y te busca alojamiento en el Norte argentino. Pagás en tu moneda, directo al dueño, sin dólar tarjeta.',
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
