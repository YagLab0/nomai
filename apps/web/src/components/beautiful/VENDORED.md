# Vendored: beautiful-ui

- **Upstream:** https://github.com/slev12397/beautiful-ui (MIT)
- **Commit:** `44a274e598395ab61e7c96c26fda2758780253b7` (2026-09-22, "LoadingState: use heavily compressed Surfer video")
- **Vendored on:** 2026-10-24
- Every file has the header `// Vendored from beautiful-ui (MIT) — see VENDORED.md`.

## Files

Flat layout: upstream `components/atoms/*` and `components/primitives/*` both live here, so upstream imports
like `@/components/atoms/Button` became `./Button`.

| File | Upstream path | Export |
| --- | --- | --- |
| `Button.tsx` | `components/atoms/Button.tsx` | `Button`, `buttonVariants`, `ButtonVariant` |
| `Chip.tsx` | `components/atoms/Chip.tsx` | `Chip` |
| `EntityChip.tsx` | `components/atoms/EntityChip.tsx` | `EntityChip`, `Monogram` |
| `ProgressRing.tsx` | `components/atoms/ProgressRing.tsx` | `ProgressRing` |
| `SegmentedControl.tsx` | `components/atoms/SegmentedControl.tsx` | `SegmentedControl` |
| `Shimmer.tsx` | `components/atoms/Shimmer.tsx` | `Shimmer` |
| `StatusPill.tsx` | `components/atoms/StatusPill.tsx` | `StatusPill` |
| `StreamText.tsx` | `components/atoms/StreamText.tsx` | `StreamText` |
| `Switch.tsx` | `components/atoms/Switch.tsx` | `Switch` |
| `TextRow.tsx` | `components/atoms/TextRow.tsx` | `TextRow` |
| `ValuePill.tsx` | `components/atoms/ValuePill.tsx` | `ValuePill` |
| `ThinkingState.tsx` | `components/primitives/ThinkingState.tsx` | default |
| `ToolChips.tsx` | `components/primitives/ToolChips.tsx` | default + `ToolStep`, `ToolDiff`, `ToolDiffLine`, `ToolDetailLine`, `ToolChipsLabels` |
| `LoadingState.tsx` | `components/primitives/LoadingState.tsx` | default |
| `ApprovalCard.tsx` | `components/primitives/ApprovalCard.tsx` | default + `ApprovalQuestion`, `ApprovalLabels` |
| `TaskRows.tsx` | `components/primitives/TaskRows.tsx` | default + `TaskRow`, `TaskDetail`, `TaskRowsLabels` |
| `RecommendationCard.tsx` | `components/primitives/RecommendationCard.tsx` | default + `RecommendationOption`, `RecommendationLabels` |
| `StreamingText.tsx` | `components/primitives/StreamingText.tsx` | default + `StreamingToken`, `StreamingSource`, `StreamingLabels` |
| `PromptBar.tsx` | `components/primitives/PromptBar.tsx` | default |
| `GlideMenu.tsx` | `components/primitives/GlideMenu.tsx` | default. Not requested, but `ApprovalCard` depends on it |
| `styles.css` | slices of `app/globals.css` | keyframes and helper classes the components need, prefixed `bui-` |
| `focus.ts` | (new) | `focusRing`, the shared terra `focus-visible` ring |

**Public prop APIs are unchanged.** Every prop name, type, default *kind*, and export matches upstream.
Only default *content* changed (see below).

## Adaptations

### Stack
- apps/web is on **Tailwind v4** (`@import "tailwindcss"` + `@theme` in `app/globals.css`), not v3 as the
  task brief said. Classes use the Nomai `@theme` color tokens. v4 dynamic spacing (`max-w-95`, `h-5.5`,
  `duration-400`) stays as upstream wrote it, since v4 resolves it.
- `oklch` is gone: `color-mix(in oklch, …)` became `color-mix(in srgb, …)`, and the oklch masks became rgb.
- **No new dependencies.** Only `react`, `react-dom` (`createPortal` in ToolChips), and `@/lib/utils` (`cn`)
  are imported.

### Color tokens (upstream → Nomai)
| Upstream | Nomai |
| --- | --- |
| `ink` / `ink-2` / `ink-3` | `ink` / `ink-muted` / `ink-muted`. `ink-3` was meant to be lighter, but `ink-muted/70` fails WCAG AA on white, so it's merged into `ink-muted`. Placeholders keep `/70` |
| `canvas`, `inset`, `field` | `paper` |
| `surface` | `white` |
| `hover`, `hover-2` | `sand/50`, `sand/40` |
| `line` | `sand` |
| `line-strong` | `ink-muted/25`–`/30`, or `--bui-line-strong` (sand mixed with ink-muted) in inline styles |
| `accent`, `accent-ink`, `accent-tint` | `terra`, `terra-deep`, `terra-soft` |
| `green`, `green-tint` | `agua`, `agua-soft` |
| `orange`, `orange-tint` | `terra`, `terra-soft` |
| `red`, `red-tint` | `terra-deep`, `terra-deep/10` (there's no red token, so "failed" reads as deep terra) |
| `tooltip-bg` / `tooltip-muted` | `ink` / `sand` |
| `shadow-hairline` / `btn` / `card` / `raised` / `overlay` | `ring-1 ring-sand` plus `shadow-sm` / `sm` / `md` / `lg` |

Tone *names* in props (`"green" | "orange" | "red" | "accent" | "neutral"`) are unchanged. Only their colors moved.
No `amber` token exists in the palette, so none is used.

Selection and active states moved from ink to terra: Switch on, ApprovalCard checked radio/checkbox,
PromptBar send button, ThinkingState header glyph while working, the LoadingState pixel grid, and the
streaming carets.

### Radius and type
- `rounded-card` → `rounded-2xl`. The app's own `--radius-card` (1.75rem) would otherwise have captured it.
  `rounded-chip` → `rounded-full`; `rounded-control` → `rounded-lg`, or `rounded-full` for pill-shaped
  rows and buttons. Upstream's ad-hoc `rounded-[5|6|10px]` moved to scale values.
- PromptBar keeps both variants: `"Pill"` (rounded-full, rounded-3xl once expanded) and the default
  `"Rounded"` (rounded-2xl, rounded-3xl when `tall`).
- `font-brand` on card headings (ApprovalCard question, RecommendationCard title). `font-mono` on
  amounts and data (TextRow value, TaskRows amount, ProgressRing center, ApprovalCard step counter).

### Icons
- Upstream uses no icon library, only inline 24×24 SVG paths in the lucide style. Those are kept.
  **`lucide-react` is not a dependency of apps/web**, and adding it would break the no-new-deps rule.
- PromptBar's full-color Figma/Slack/Gmail brand marks (`BRANDS`) are removed. The `@` sources became
  Nomai sources with lucide-style glyphs (calendar, home, globe, wallet, swap).

### Dropped / reimplemented behavior
- **`class-variance-authority`** (Button, StatusPill) was replaced by plain lookup maps plus `cn`.
  `buttonVariants({ variant, size })` keeps its call signature.
- **`glimm`** (PromptBar's WebGL rainbow shader sweep on model upgrade) is gone. A one-shot CSS gradient band
  in terra-soft/agua-soft (`.bui-sweep` in `styles.css`) replays on a `key` bump instead. It is skipped
  under reduced motion, as upstream did.
- Global CSS that upstream kept in `app/globals.css` now lives in `styles.css`, imported by each component
  that needs it, so wiring needs no global edit. That covers the keyframes (`shimmer-text`, `fade-up`,
  `fade-in`, `pop-in`, `spin`, `eq-bounce`, `caret-blink`, `pixel-on`), `primitive-card-pad`, `-footer`,
  `-icon-button`, `animated-underline`, `stream-tail`, `stream-caret`, and `source-avatar`. Everything is
  renamed `bui-*` to avoid colliding with Tailwind's `spin` and the app's keyframes.
- Upstream's site-wide `:focus-visible` outline and `.dark` overrides were not vendored. There is no dark mode yet.

### Accessibility
- Every interactive element gets `focusRing` (`focus-visible:ring-2 ring-terra ring-offset-2`) and
  `type="button"`. The ApprovalCard free-text row shows a terra `focus-within` ring.
- Reduced motion: `app/globals.css` already collapses all animations and transitions. `styles.css` also
  drops the stream blur/mask, caret blink, and sweep. Button press-scale is off under `motion-reduce`.
- Added `aria-hidden` on decorative SVGs, dots, meters, and monograms. Added `role="progressbar"` with
  values on ProgressRing. StreamingText action buttons get real labels (Copiar / Reintentar / Me sirvió /
  No me sirvió) instead of `"Action"`. LoadingState's 100 ms elapsed ticker is `aria-hidden`, so it no
  longer floods the `role="status"` live region.

### Copy and demo content
- Default labels, aria-labels, and placeholders are in rioplatense Spanish to match the app. PromptBar
  defaults to "Contale a Nomito a dónde querés ir…".
- The built-in demo data (ice-cream shop) became Nomai travel examples using the domain vocabulary
  (Reserva, Escrow, Service fee, Propietario, `check_balance` / `pay_endpoint`). Callers are expected
  to pass real `rows` / `steps` / `questions` / `options` / `content` / `labels`.
- PromptBar's `MODELS` are Nomito / Nomito Pro / Nomito Lite. Selecting "Nomito Pro" triggers the sweep.
  `SOURCES`, `COMMANDS`, and `MODELS` are still internal constants with no props, as upstream.
- LoadingState's `"Surfer"` variant still defaults `videoSrc` to upstream's Vercel Blob meme clip. Pass
  `videoSrc` or avoid that variant in production.

### Known lint warnings (upstream, left as-is)
- `@next/next/no-img-element` in StreamingText (tiny favicon avatars).
- `react-hooks/exhaustive-deps` on PromptBar's autoplay effect.
