import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";

import { LodgingExplorer } from "@/components/marketplace/lodging-explorer";

export const metadata: Metadata = {
  title: "nomai — alojamientos",
  description:
    "Marketplace de alojamientos publicados por dueños verificados. Reservás en stablecoins locales y el pago x402 va directo a la wallet del dueño: 0% comisión.",
};

export default function AlojamientosPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 pb-28 pt-10 md:pt-14">
      <header className="mx-auto mb-10 max-w-2xl text-center font-readex">
        <p className="mb-3 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-burn">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          Marketplace · dueños verificados
        </p>
        <h1 className="text-4xl font-medium tracking-tight md:text-5xl">
          Alojamientos
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Cada publicación es de un dueño. Reservás con tu agente, pagás en tu
          moneda y el pago x402 va directo a su wallet — 0% comisión,
          liquidación en segundos.
        </p>
      </header>

      <LodgingExplorer />
    </div>
  );
}
