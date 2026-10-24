// Vendored from beautiful-ui (MIT) — see VENDORED.md
"use client";

import { useEffect, useState } from "react";
import { focusRing } from "./focus";
import "./styles.css";

/* ─────────────────────────────────────────────────────────
 * TASK ROWS
 *
 *     0ms   rows enter staggered (80ms apart)
 *   600ms   row 1 ring sweeps 0 → 66%
 *  1500ms   row 1 expands — detail steps drop down
 *  3900ms   row 1 collapses; row 2 flips to Failed + retry
 *  5300ms   row 2 resolves to Completed
 * The status run completes once; task details stay clickable.
 * ───────────────────────────────────────────────────────── */

const TICKS = [600, 900, 2400, 1400, 2400, 600];

function useTick(intervals: number[]) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick >= intervals.length - 1) return;
    const t = setTimeout(() => setTick((x) => x + 1), intervals[tick]);
    return () => clearTimeout(t);
  }, [tick, intervals]);
  return tick;
}

function SpinnerRing({ active, children }: { active?: boolean; children?: React.ReactNode }) {
  const size = 24, stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size} height={size} className="absolute inset-0"
        style={active ? { animation: "bui-spin 1.1s linear infinite" } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sand)" strokeWidth={stroke} />
        {active && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="var(--ink-muted)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">{children}</span>
    </span>
  );
}

function Badge({ tone, children }: { tone: "red" | "green"; children: React.ReactNode }) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full text-white
        ${tone === "red" ? "bg-terra-deep" : "bg-agua"}`}
      style={{ animation: "bui-pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}

const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
);
const CheckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);
const RetryIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
);

/* One detail line shown when a task row is expanded. */
export type TaskDetail = { label: string; meta: string };

/* A single task row.
 *  - "done"     → green check badge + completed pill (static)
 *  - "running"  → active spinner showing `step`, no pill (static)
 *  - "sequence" → animation-driven: pending spinner → failed → completed
 */
export type TaskRow = {
  key: string;
  label: string;
  amount: string;
  status: "done" | "running" | "sequence";
  step?: number;
  details: TaskDetail[];
};

export type TaskRowsLabels = {
  completed: string;
  failed: string;
};

const DEFAULT_LABELS: TaskRowsLabels = {
  completed: "Listo",
  failed: "Falló",
};

const TASK_ROWS: TaskRow[] = [
  {
    key: "verify",
    label: "Verificó disponibilidad",
    amount: "12 alojamientos",
    status: "done",
    details: [
      { label: "Fechas libres del 12 al 15", meta: "12/12" },
      { label: "Sin calendarios desactualizados", meta: "0" },
    ],
  },
  {
    key: "index",
    label: "Comparando precios",
    amount: "7 opciones",
    status: "running",
    step: 2,
    details: [
      { label: "Leyendo tarifas por noche", meta: "3 pueblos" },
      { label: "Calculando Service fee", meta: "68%" },
    ],
  },
  {
    key: "draft",
    label: "Pagando la Reserva",
    amount: "126 USDC",
    status: "sequence",
    step: 3,
    details: [
      { label: "Depósito en Escrow", meta: "126.00" },
      { label: "Service fee", meta: "6.30" },
    ],
  },
];

export default function TaskRows({
  variant = "Capsules",
  rows = TASK_ROWS,
  labels,
  className,
  onToggleRow,
}: {
  variant?: string;
  rows?: TaskRow[];
  labels?: Partial<TaskRowsLabels>;
  className?: string;
  onToggleRow?: (key: string, open: boolean) => void;
}) {
  const tick = useTick(TICKS);
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const row2: "pending" | "failed" | "done" = tick < 3 ? "pending" : tick === 3 ? "failed" : "done";
  const copy = { ...DEFAULT_LABELS, ...labels };

  const badgeFor = (row: TaskRow) => {
    if (row.status === "done") return <Badge tone="green">{CheckIcon}</Badge>;
    if (row.status === "running") return <SpinnerRing active>{row.step}</SpinnerRing>;
    return row2 === "pending" ? (
      <SpinnerRing>{row.step}</SpinnerRing>
    ) : row2 === "failed" ? (
      <Badge tone="red">{XIcon}</Badge>
    ) : (
      <Badge tone="green">{CheckIcon}</Badge>
    );
  };

  const pillFor = (row: TaskRow) => {
    if (row.status === "done")
      return (
        <span className="inline-flex h-5.5 items-center rounded-full bg-agua-soft px-2 text-[11.5px] font-medium text-agua">
          {copy.completed}
        </span>
      );
    if (row.status === "running") return null;
    return row2 === "failed" ? (
      <span className="inline-flex h-5.5 items-center gap-1.5 rounded-full bg-terra-deep/10 px-2 text-[11.5px] font-medium text-terra-deep" style={{ animation: "bui-fade-in 200ms ease-out both" }}>
        {copy.failed} <span style={{ animation: "bui-spin 1.2s linear infinite" }} className="flex">{RetryIcon}</span>
      </span>
    ) : row2 === "done" ? (
      <span className="inline-flex h-5.5 items-center gap-1.5 rounded-full bg-agua-soft px-2 text-[11.5px] font-medium text-agua" style={{ animation: "bui-fade-in 200ms ease-out both" }}>
        {copy.completed}
      </span>
    ) : null;
  };

  const list = variant === "List";
  return (
    <div
      className={`flex w-full max-w-110 flex-col ${
        list ? "gap-0 self-start overflow-hidden rounded-2xl bg-white ring-1 ring-sand shadow-sm" : "min-h-[196px] gap-2"
      }${className ? ` ${className}` : ""}`}
    >
      {rows.map((row, i) => {
        const open = manualOpen[row.key] ?? (row.key === "index" && tick === 2);
        return (
          <div
            key={row.key}
            className={`self-stretch overflow-hidden transition-[border-radius,background-color] duration-300 hover:bg-paper ${
              list ? "border-b border-sand last:border-0" : "bg-white ring-1 ring-sand shadow-sm"
            }`}
            style={{
              borderRadius: list ? 0 : open ? 14 : 22,
              animation: `bui-fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
            }}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => {
                setManualOpen((current) => ({ ...current, [row.key]: !open }));
                onToggleRow?.(row.key, !open);
              }}
              className={`${focusRing} flex h-11 w-full items-center gap-2.5 rounded-[inherit] px-2.5 text-left`}
            >
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center">
                {badgeFor(row)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {row.label}
              </span>
              <span className="font-mono text-[12.5px] text-ink-muted tabular-nums">{row.amount}</span>
              {pillFor(row)}
              <span
                aria-hidden="true"
                className="-ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted"
              >
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  className="transition-transform duration-300"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>

            {/* dropdown detail — same expandable grammar as Chain of Thought */}
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{
                  gridTemplateRows: open ? "1fr" : "0fr",
                  opacity: open ? 1 : 0,
                  transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                }}
              >
                <div className="overflow-hidden">
                  <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                    <span aria-hidden className="mx-auto h-full w-px bg-sand" />
                    <div className="flex flex-col gap-1.5">
                      {row.details.map((d, j) => (
                        <div
                          key={d.label}
                          className="flex items-center justify-between"
                          style={
                            open
                              ? { animation: `bui-fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + j * 100}ms both` }
                              : undefined
                          }
                        >
                          <span className="text-[12px] text-ink-muted">{d.label}</span>
                          <span className="font-mono text-[11.5px] text-ink-muted tabular-nums">
                            {d.meta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
          </div>
        );
      })}
    </div>
  );
}
