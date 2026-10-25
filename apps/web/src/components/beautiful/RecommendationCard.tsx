// Vendored from beautiful-ui (MIT) — see VENDORED.md
"use client";

import { useState } from "react";
import { Button, type ButtonVariant } from "./Button";
import { EntityChip } from "./EntityChip";
import { ValuePill } from "./ValuePill";
import { focusRing } from "./focus";
import "./styles.css";

/* ─────────────────────────────────────────────────────────
 * RECOMMENDATION CARD
 * The card holds its shape. Pressing "Alternatives" opens a
 * new drawer listing the other options; picking one promotes
 * it to the recommendation. The primary action confirms.
 * ───────────────────────────────────────────────────────── */

export type RecommendationOption = {
  key: string;
  body: React.ReactNode;
  short: string;
  signal: number;
  tone: string;
  label: string;
  cta: string;
  ctaVariant: ButtonVariant;
};

export type RecommendationLabels = {
  title: string;
  alternatives: string;
  otherOptions: string;
  accepted: string;
};

const DEFAULT_LABELS: RecommendationLabels = {
  title: "¿Reservo este alojamiento?",
  alternatives: "Alternativas",
  otherOptions: "Otras opciones",
  accepted: "Aceptado",
};

const OPTIONS: RecommendationOption[] = [
  {
    key: "high",
    body: (
      <>
        Tres noches en{" "}
        <EntityChip name="Posada El Algarrobo" />{" "}
        con cancelación gratis hasta <ValuePill tone="green">5 días antes</ValuePill>
      </>
    ),
    short: "Posada El Algarrobo · 3 noches",
    signal: 3,
    tone: "var(--agua)",
    label: "Muy recomendable",
    cta: "Reservar",
    ctaVariant: "accent",
  },
  {
    key: "review",
    body: (
      <>
        Cambiar a <ValuePill>Cabañas del Pucará</ValuePill> — más barato, pero sin desayuno.
      </>
    ),
    short: "Cabañas del Pucará · sin desayuno",
    signal: 2,
    tone: "var(--terra)",
    label: "Revisar",
    cta: "Ver detalles",
    ctaVariant: "primary",
  },
  {
    key: "none",
    body: (
      <>
        Seguir buscando en <span className="font-medium text-ink">otros pueblos</span> de la Quebrada.
      </>
    ),
    short: "Seguir buscando en la Quebrada",
    signal: 0,
    tone: "var(--ink-muted)",
    label: "Sin datos",
    cta: "Seguir buscando",
    ctaVariant: "primary",
  },
];

function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span aria-hidden className="flex items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{ height: 10, background: bar < signal ? tone : "var(--bui-line-strong)" }}
        />
      ))}
    </span>
  );
}

export default function RecommendationCard({
  options = OPTIONS,
  labels,
}: {
  options?: RecommendationOption[];
  labels?: Partial<RecommendationLabels>;
  variant?: string;
} = {}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const active = options[selected];
  const others = options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);

  return (
    <div className="w-full max-w-95 overflow-hidden rounded-2xl bg-white ring-1 ring-sand shadow-sm">
      <div className="bui-card-pad">
        <span className="font-brand text-[15px] font-medium text-ink">
          {t.title}
        </span>
        <p
          key={active.key}
          className="mt-1.5 min-h-12 text-[13px] leading-relaxed text-ink-muted"
          style={{ animation: "bui-fade-in 180ms ease-out both" }}
        >
          {active.body}
        </p>
      </div>

      {/* alternatives drawer — a distinctly new section of the card */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-sand bg-white px-2 py-2">
            <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-muted">
              {t.otherOptions}
            </p>
            {others.map(({ o, i }) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setSelected(i);
                  setAccepted(false);
                }}
                className={`${focusRing} flex w-full items-center gap-2.5 rounded-full px-1.5 py-1.5
                  text-left transition-colors duration-100 hover:bg-sand/50`}
              >
                <Meter signal={o.signal} tone={o.tone} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{o.short}</span>
                <span className="shrink-0 text-[11px] text-ink-muted">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bui-card-footer flex items-center justify-between gap-3 bg-white">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-[12.5px] font-medium text-ink-muted">{active.label}</span>
        </span>

        <span className="-mr-0.5 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="px-2.5 text-[12.5px]"
          >
            {t.alternatives}
          </Button>
          <Button
            variant={accepted ? "success" : active.ctaVariant}
            size="sm"
            onClick={() => setAccepted(true)}
            className="text-[12.5px]"
          >
            {accepted ? t.accepted : active.cta}
          </Button>
        </span>
      </div>
    </div>
  );
}
