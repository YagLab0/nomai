// Vendored from beautiful-ui (MIT) — see VENDORED.md
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { focusRing } from "./focus";
import "./styles.css";

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS
 * An agent run as compact rows: tool calls with inline
 * chips, then file-diff chips summarizing the edits.
 * Hover a row to reveal its chevron; every row expands
 * to show what the tool actually did.
 * ───────────────────────────────────────────────────────── */

const STEP_MS = 700;

const Icons: Record<string, React.ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></g>,
  run: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-5-6-5M12 19h8" /></g>,
  read: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></g>,
};

export type ToolDetailLine = { text: string; tone?: "add" };

export type ToolStep = {
  /** Stable row identity — the same label may repeat across calls. */
  id?: string;
  icon: string;
  label: string;
  chip: string;
  mono: boolean;
  detailMono: boolean;
  detail: ToolDetailLine[];
};

export type ToolDiff = { file: string; add: number; del: number };

export type ToolDiffLine = { text: string; tone: "add" | "del" | "ctx" };

export type ToolChipsLabels = {
  header: string;
  more: string;
};

const DEFAULT_LABELS: ToolChipsLabels = {
  header: "4 herramientas, 2 mensajes",
  more: "+2 más",
};

const ROWS: ToolStep[] = [
  {
    icon: "think", label: "Pensando", chip: "Planeando el viaje a Tilcara…", mono: false, detailMono: false,
    detail: [
      { text: "Llegás el viernes, así que busco check-in desde el 12." },
      { text: "Dos opciones entran en tu presupuesto por noche." },
    ],
  },
  {
    icon: "read", label: "Consultó saldo", chip: "check_balance", mono: true, detailMono: true,
    detail: [
      { text: "USDC  182.40" },
      { text: "wARS  95 000" },
    ],
  },
  {
    icon: "run", label: "Pagó la Reserva", chip: "pay_endpoint", mono: true, detailMono: true,
    detail: [
      { text: "✓ 402 → pago firmado", tone: "add" },
      { text: "✓ fondos en Escrow", tone: "add" },
    ],
  },
  {
    icon: "write", label: "Escribió al Propietario", chip: "Posada El Algarrobo", mono: false, detailMono: false,
    detail: [
      { text: "Confirmé llegada estimada a las 15 h." },
      { text: "Pedí estacionamiento para un auto." },
    ],
  },
];

const DIFFS: ToolDiff[] = [
  { file: "reserva.json", add: 13, del: 0 },
  { file: "itinerario.md", add: 24, del: 6 },
  { file: "presupuesto.csv", add: 8, del: 2 },
];

/* hovering a file chip opens its diff — agua added, terra removed */
const DIFF_LINES: Record<string, ToolDiffLine[]> = {
  "reserva.json": [
    { text: "{", tone: "ctx" },
    { text: '  "estado": "pendiente",', tone: "del" },
    { text: '  "estado": "confirmada",', tone: "add" },
    { text: '  "escrow": true', tone: "add" },
    { text: "}", tone: "ctx" },
  ],
  "itinerario.md": [
    { text: "## Viernes", tone: "ctx" },
    { text: "- Llegada a Purmamarca", tone: "del" },
    { text: "- Llegada a Tilcara", tone: "add" },
    { text: "- Check-in 15 h", tone: "add" },
  ],
  "presupuesto.csv": [
    { text: "noche,USDC,48", tone: "del" },
    { text: "noche,USDC,42", tone: "add" },
  ],
};

export default function ToolChips({
  steps = ROWS,
  diffs = DIFFS,
  diffLines = DIFF_LINES,
  labels,
  className,
  onOpenChange,
  onToggleRow,
}: {
  /** Accepted for gallery/registry parity; ToolChips has no visual variants. */
  variant?: string;
  steps?: ToolStep[];
  diffs?: ToolDiff[];
  diffLines?: Record<string, ToolDiffLine[]>;
  labels?: Partial<ToolChipsLabels>;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onToggleRow?: (label: string, open: boolean) => void;
} = {}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  /* Rendered in a body portal so animated/translated reply wrappers cannot
   * redefine the fixed-position coordinate system. */
  const [preview, setPreview] = useState<{
    file: string;
    x: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const openPreview = (file: string) => (event: React.SyntheticEvent) => {
    const rect = (event.currentTarget as Element).closest("[data-diffchip]")!.getBoundingClientRect();
    const previewHeight = 38 + (diffLines[file]?.length ?? 0) * 19;
    const fitsBelow = rect.bottom + 6 + previewHeight <= window.innerHeight - 12;
    setPreview({
      file,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      ...(fitsBelow
        ? { top: rect.bottom + 6 }
        : { bottom: window.innerHeight - rect.top + 6 }),
    });
  };
  const closePreview = (file: string) => () =>
    setPreview((current) => (current?.file === file ? null : current));
  const total = steps.length + 1; // rows, then diff chips

  useEffect(() => {
    if (step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, total]);

  const toggleRow = (id: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      onToggleRow?.(id, next.has(id));
      return next;
    });

  return (
    <div className={`min-h-[220px] w-full max-w-80 pb-1${className ? ` ${className}` : ""}`}>
      {/* collapsed run header */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() =>
          setOpen((current) => {
            onOpenChange?.(!current);
            return !current;
          })
        }
        className={`${focusRing} -mx-1.5 flex w-fit items-center gap-1.5 rounded-full px-1.5 py-1 text-[12.5px] text-ink-muted transition-colors duration-100 hover:bg-sand/40`}
      >
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="tabular-nums">{copy.header}</span>
      </button>

      {/* tool call rows */}
      <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
        {/* -mx-1 + px-1.5 keeps content at the same x while giving the
            row hover pills room inside this overflow-hidden clip box */}
        <div className="-mx-1 overflow-hidden px-1.5 pb-1">
        <div className="mt-1.5 flex flex-col gap-1">
          {steps.slice(0, step).map((row) => {
            const rowId = row.id ?? row.label;
            const rowOpen = openRows.has(rowId);
            return (
            <div key={rowId} style={{ animation: "bui-fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
              <button
                type="button"
                aria-expanded={rowOpen}
                onClick={() => toggleRow(rowId)}
                className={`${focusRing} group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-lg px-[3px] text-left transition-colors duration-100 hover:bg-sand/40`}
              >
                <span aria-hidden className="relative flex size-4 shrink-0 items-center justify-center text-ink-muted">
                  <svg
                    width="13" height="13" viewBox="0 0 24 24" fill={row.icon === "think" ? "currentColor" : "none"} stroke="currentColor"
                    className={`transition-opacity duration-100 group-hover/row:opacity-0 ${rowOpen ? "opacity-0" : ""}`}
                  >
                    {Icons[row.icon]}
                  </svg>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    className={`absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${rowOpen ? "opacity-100" : "opacity-0"}`}
                    style={{ transform: rowOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
                <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.label}</span>
                <span
                  className={`inline-flex h-5.5 min-w-0 flex-1 cursor-pointer items-center truncate rounded-full bg-paper px-1.5
                    text-[11.5px] text-ink-muted ring-1 ring-sand transition-colors duration-100 hover:bg-sand/40
                    ${row.mono ? "font-mono" : ""}`}
                >
                  {row.chip}
                </span>
              </button>

              {/* expanded detail */}
              <div
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{ gridTemplateRows: rowOpen ? "1fr" : "0fr", opacity: rowOpen ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-sand py-0.5 pl-3.5">
                    {row.detail.map((line, i) => (
                      <span
                        key={i}
                        className={`truncate text-[11.5px] leading-[1.6] ${row.detailMono ? "font-mono" : ""} ${line.tone === "add" ? "text-agua" : "text-ink-muted"}`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>

      {/* file-diff chips */}
      {step >= total && (
        <div className="mt-2.5 flex max-w-full flex-wrap gap-1.5 border-t border-sand pt-2.5">
          {diffs.map((d, i) => (
            <span
              key={d.file}
              data-diffchip
              className="relative"
              onMouseEnter={openPreview(d.file)}
              onMouseLeave={closePreview(d.file)}
            >
              <button
                type="button"
                aria-expanded={preview?.file === d.file}
                aria-label={`Ver cambios en ${d.file}`}
                onFocus={openPreview(d.file)}
                onBlur={closePreview(d.file)}
                className={`${focusRing} inline-flex h-7 max-w-full items-center gap-2 rounded-full
                  bg-white px-2 font-mono text-[11.5px] text-ink ring-1 ring-sand shadow-sm
                  transition-colors duration-100 hover:bg-sand/50`}
                style={{ animation: `bui-pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both` }}
              >
                <span className="min-w-0 truncate">{d.file}</span>
                <span className="shrink-0 text-agua tabular-nums">+{d.add}</span>
                {d.del > 0 && <span className="shrink-0 text-terra-deep tabular-nums">−{d.del}</span>}
              </button>

            </span>
          ))}
          <button
            type="button"
            className={`${focusRing} inline-flex h-7 items-center rounded-full px-1.5 font-mono text-[11.5px] text-ink-muted
              underline decoration-transparent underline-offset-2 transition-colors duration-100
              hover:text-ink-muted hover:decoration-current`}
            style={{ animation: `bui-fade-in 300ms ease-out ${diffs.length * 80}ms both` }}
          >
            {copy.more}
          </button>
        </div>
      )}
        </div>
      </div>
      {preview && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-50 w-72 overflow-hidden rounded-2xl bg-white ring-1 ring-sand shadow-lg"
          style={{
            left: preview.x,
            top: preview.top,
            bottom: preview.bottom,
            animation: "bui-pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
            transformOrigin: preview.top === undefined ? "bottom left" : "top left",
          }}
        >
          <div className="flex items-center justify-between border-b border-sand px-2.5 py-1.5 font-mono text-[11px]">
            <span className="min-w-0 truncate text-ink-muted">{preview.file}</span>
            <span className="shrink-0 tabular-nums">
              <span className="text-agua">+{diffs.find((diff) => diff.file === preview.file)?.add}</span>
              {(diffs.find((diff) => diff.file === preview.file)?.del ?? 0) > 0 && (
                <span className="text-terra-deep"> −{diffs.find((diff) => diff.file === preview.file)?.del}</span>
              )}
            </span>
          </div>
          <div className="py-1 font-mono text-[11px] leading-[1.8]">
            {(diffLines[preview.file] ?? []).map((line, index) => (
              <div
                key={index}
                className={`flex gap-2 px-2.5 whitespace-pre ${
                  line.tone === "add"
                    ? "bg-agua-soft text-agua"
                    : line.tone === "del"
                      ? "bg-terra-deep/10 text-terra-deep"
                      : "text-ink-muted"
                }`}
              >
                <span className="w-3 shrink-0 select-none">{line.tone === "add" ? "+" : line.tone === "del" ? "−" : " "}</span>
                <span className="min-w-0 truncate">{line.text}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
