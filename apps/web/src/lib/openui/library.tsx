'use client';

/**
 * nomai's OpenUI component catalog — the generative-UI vocabulary the chat
 * can render. The Agent replies with prose plus fenced ```openui-lang
 * programs; <Renderer> in openui-text.tsx evaluates each program against
 * `library` and mounts these components with real props.
 *
 * Keep the catalog tight: every entry costs prompt tokens and is one more
 * component the model can misuse.
 *
 * After changing this file, regenerate the machine-readable spec and sync it
 * into the agent bundle:
 *   pnpm --filter web exec openui generate src/lib/openui/library.tsx --spec \
 *     --out src/lib/openui/openui.spec.json
 *   node apps/agent/scripts/sync-openui-spec.mjs
 */

import { Button } from '@heroui/react';
import {
  action,
  createLibrary,
  defineComponent,
  useSetFieldValue,
  useTriggerAction,
  type ComponentRenderProps,
  type PromptOptions,
} from '@openuidev/react-lang';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { z } from 'zod/v4';

import { ProseText } from '@/components/app/chat/prose-text';
import { CheckIcon, XIcon } from '@/components/icons';
import { AvailabilityCalendar } from '@/components/marketplace/availability-calendar';

// Leaflet touches `window` at import — the map body only ever loads client-side.
const MapCardMap = dynamic(() => import('./map-card-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-sand/60" />,
});

const GAP_CLASS = { sm: 'gap-2', md: 'gap-3', lg: 'gap-5' } as const;

const SIZE_CLASS = {
  'large-heavy': 'font-brand text-lg font-medium leading-tight text-ink',
  body: 'text-sm leading-snug text-ink',
  small: 'text-sm text-ink-muted',
} as const;

const textContentProps = z.object({
  text: z.string(),
  size: z.enum(['large-heavy', 'body', 'small']).optional(),
});

function TextContentView({ props }: ComponentRenderProps<z.infer<typeof textContentProps>>) {
  const size = props.size ?? 'body';
  if (size === 'body') return <ProseText text={props.text} />;
  return <p className={SIZE_CLASS[size]}>{props.text}</p>;
}

const TextContent = defineComponent({
  name: 'TextContent',
  props: textContentProps,
  description:
    'Styled text that lives INSIDE a UI program (headings, notes between cards). Prose outside a fenced block renders as a normal chat message — never wrap the whole reply in one.',
  component: TextContentView,
});

const listingCardProps = z.object({
  name: z.string(),
  city: z.string(),
  /** Display-ready nightly price, e.g. "US$ 76 / noche" or "$ 95.000 / noche". */
  price: z.string(),
  /** Trust chip, e.g. "pago en garantía". */
  badge: z.string().optional(),
  choose: action(),
  blurb: z.string().optional(),
  /** Three-letter ticket code for the stub column, e.g. "CFY". */
  code: z.string().optional(),
  /** Photo URL — the listing's cover_photo returned by the API, verbatim. Omit it when the API returns none; never invent one. */
  image: z.string().optional(),
});

function ListingCardView({ props }: ComponentRenderProps<z.infer<typeof listingCardProps>>) {
  const triggerAction = useTriggerAction();
  /* Container queries, not viewport: a card squeezed into a ~320px carousel
   * slot must stack vertically even on a wide browser. */
  return (
    <div className="@container h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-sand bg-white @lg:flex-row">
        {props.image ? (
          <img
            src={props.image}
            alt={props.name}
            className="h-32 w-full shrink-0 object-cover @lg:h-auto @lg:w-36"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0 flex-1 p-3.5">
          <p className="font-brand text-base font-medium leading-tight text-ink">{props.name}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{props.city}</p>
          {props.blurb ? (
            <p className="mt-1.5 line-clamp-3 text-sm leading-snug text-ink">{props.blurb}</p>
          ) : null}
          {props.badge ? (
            <span className="mt-2.5 inline-flex rounded-full bg-agua-soft px-2.5 py-0.5 text-xs font-medium leading-snug text-agua">
              {props.badge}
            </span>
          ) : null}
        </div>

        <div className="relative flex w-full shrink-0 flex-row items-center justify-between gap-3 border-t-2 border-dashed border-sand p-3 @lg:w-36 @lg:flex-col @lg:justify-center @lg:gap-2 @lg:border-l-2 @lg:border-t-0 @lg:text-center">
          <span aria-hidden="true" className="absolute -left-2 -top-2 hidden h-4 w-4 rounded-full bg-paper @lg:block" />
          <span aria-hidden="true" className="absolute -bottom-2 -left-2 hidden h-4 w-4 rounded-full bg-paper @lg:block" />
          {props.code ? (
            <span className="hidden font-mono text-xs tracking-widest text-ink-muted @lg:block">{props.code}</span>
          ) : null}
          <p className="font-mono text-sm font-semibold text-ink">{props.price}</p>
          <div className="shrink-0 @lg:w-full">
            <Button
              size="sm"
              fullWidth
              onPress={() => void triggerAction('Elegir', undefined, props.choose)}
            >
              Elegir
            </Button>
          </div>
        </div>
      </article>
    </div>
  );
}

const ListingCard = defineComponent({
  name: 'ListingCard',
  props: listingCardProps,
  description:
    'A lodging option as a ticket-stub card: name, city and optional blurb on the left; a perforated stub with the nightly price and an "Elegir" button on the right. Only with real data from the listings tools.',
  component: ListingCardView,
});

const listingCarouselProps = z.object({
  children: z.array(ListingCard.ref),
});

function ListingCarouselView({
  props,
  renderNode,
}: ComponentRenderProps<z.infer<typeof listingCarouselProps>>) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = props.children.length;

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const range = el.scrollWidth - el.clientWidth;
    if (range > 0) setActive(Math.round((el.scrollLeft / range) * (count - 1)));
  };

  return (
    <div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {props.children.map((child, i) => (
          <div key={i} className="w-full shrink-0 snap-start">
            {renderNode(child)}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {props.children.map((_, i) => (
            <span
              key={i}
              className={
                i === active
                  ? 'h-1.5 w-4 rounded-full bg-terra-deep transition-all'
                  : 'h-1.5 w-1.5 rounded-full bg-ink/20 transition-all'
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

const ListingCarousel = defineComponent({
  name: 'ListingCarousel',
  props: listingCarouselProps,
  description:
    'Swipeable carousel of 2+ lodging options — children are ListingCard elements, one full-width card per swipe with dot pagination. Use INSTEAD of several stacked ListingCard when showing multiple options; keep a single ListingCard for one option.',
  component: ListingCarouselView,
});

const quoteCardProps = z.object({
  /** e.g. "Loft San Telmo · 3 noches". */
  title: z.string(),
  /** Itemized quote lines; kind: "fee" highlights the Nomai FX fee, "total" the last bold row. */
  lines: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      kind: z.enum(['fee', 'total']).optional(),
    }),
  ),
  confirm: action(),
  /** Display-ready Service fee from quote_booking, e.g. "US$ 6" — its own line before the total. */
  serviceFee: z.string().optional(),
});

type QuoteLine = z.infer<typeof quoteCardProps>['lines'][number];

function QuoteCardView({ props }: ComponentRenderProps<z.infer<typeof quoteCardProps>>) {
  const triggerAction = useTriggerAction();
  let lines: QuoteLine[] = props.lines;
  if (props.serviceFee) {
    const fee: QuoteLine = { label: 'Service fee nomai', value: props.serviceFee };
    const at = lines.findIndex((l) => l.kind === 'total');
    lines = at === -1 ? [...lines, fee] : [...lines.slice(0, at), fee, ...lines.slice(at)];
  }
  return (
    <section
      aria-label={`Detalle de reserva: ${props.title}`}
      className="overflow-hidden rounded-2xl border border-sand bg-white"
    >
      <p className="px-4 pb-1 pt-3.5 font-brand text-lg font-medium leading-tight text-ink">
        {props.title}
      </p>
      <dl className="divide-y divide-sand px-4">
        {lines.map((line) => (
          <div
            key={line.label}
            className={`flex items-baseline justify-between gap-4 py-2.5 text-sm ${
              line.kind === 'total' ? 'font-semibold text-ink' : 'text-ink'
            }`}
          >
            <dt
              className={
                line.kind === 'fee'
                  ? 'text-terra-deep'
                  : line.kind === 'total'
                    ? ''
                    : 'text-ink-muted'
              }
            >
              {line.label}
            </dt>
            <dd className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-t-2 border-dashed border-sand p-4">
        <Button
          fullWidth
          size="lg"
          onPress={() => void triggerAction('Confirmar reserva', undefined, props.confirm)}
        >
          Confirmar reserva
        </Button>
      </div>
    </section>
  );
}

const QuoteCard = defineComponent({
  name: 'QuoteCard',
  props: quoteCardProps,
  description:
    'An itemized booking quote (subtotal, conversion, FX fee, total) with a dashed ticket footer and a "Confirmar reserva" button. Only render after a real quote_booking result — never invent lines. serviceFee = the quote\'s Service fee amount verbatim (rendered automatically as a "Service fee nomai" line right before the total — do NOT also add it to lines); omit it if the quote has none.',
  component: QuoteCardView,
});

const imageGridProps = z.object({
  /** Photo URLs — always the listing's photos[].url returned by the API, verbatim. */
  images: z.array(z.string()),
  alt: z.string().optional(),
});

function ImageGridView({ props }: ComponentRenderProps<z.infer<typeof imageGridProps>>) {
  if (props.images.length === 0) return null;
  const [cover, ...rest] = props.images;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 overflow-hidden rounded-2xl">
      {cover ? (
        <img
          src={cover}
          alt={props.alt ?? ''}
          className="col-span-3 h-44 w-full rounded-xl object-cover"
          loading="lazy"
        />
      ) : null}
      {rest.slice(0, 3).map((src) => (
        <img
          key={src}
          src={src}
          alt={props.alt ?? ''}
          className="h-24 w-full rounded-xl object-cover"
          loading="lazy"
        />
      ))}
    </div>
  );
}

const ImageGrid = defineComponent({
  name: 'ImageGrid',
  props: imageGridProps,
  description:
    'Photo mosaic for a single listing detail: one large cover image plus up to 3 thumbnails. Use after get_listing with the photos[].url values — never invent URLs. Omit it entirely when the listing has no photos.',
  component: ImageGridView,
});

const sectionHeaderProps = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
});

function SectionHeaderView({
  props,
}: ComponentRenderProps<z.infer<typeof sectionHeaderProps>>) {
  return (
    <header>
      <p className="font-brand text-lg font-medium leading-tight text-ink">{props.title}</p>
      {props.subtitle ? (
        <p className="mt-0.5 text-sm text-ink-muted">{props.subtitle}</p>
      ) : null}
    </header>
  );
}

const SectionHeader = defineComponent({
  name: 'SectionHeader',
  props: sectionHeaderProps,
  description:
    'Screen/section heading inside a program — the title of a generated view or a group divider.',
  component: SectionHeaderView,
});

const chipRowProps = z.object({
  chips: z.array(
    z.object({
      label: z.string(),
      /** Optional follow-up fired when the chip is tapped. */
      action: action().optional(),
    }),
  ),
});

function ChipRowView({ props }: ComponentRenderProps<z.infer<typeof chipRowProps>>) {
  const triggerAction = useTriggerAction();
  const chipClass =
    'rounded-full border border-sand bg-white px-3 py-1.5 text-sm text-ink';
  return (
    <div className="flex flex-wrap gap-2">
      {props.chips.map((chip, i) =>
        chip.action ? (
          <button
            key={`${chip.label}-${i}`}
            type="button"
            onClick={() => void triggerAction(chip.label, undefined, chip.action)}
            className={`${chipClass} transition-colors hover:bg-paper`}
          >
            {chip.label}
          </button>
        ) : (
          <span key={`${chip.label}-${i}`} className={chipClass}>
            {chip.label}
          </span>
        ),
      )}
    </div>
  );
}

const ChipRow = defineComponent({
  name: 'ChipRow',
  props: chipRowProps,
  description:
    'Row of refinement/filter chips (e.g. "Solo posadas", "Solo San Blas") — each chip can carry an action to trigger a follow-up.',
  component: ChipRowView,
});

const detailListProps = z.object({
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ),
});

function DetailListView({ props }: ComponentRenderProps<z.infer<typeof detailListProps>>) {
  return (
    <dl className="divide-y divide-sand">
      {props.items.map((item) => (
        <div
          key={item.label}
          className="flex items-baseline justify-between gap-4 py-2 text-sm"
        >
          <dt className="shrink-0 text-ink-muted">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium text-ink [overflow-wrap:anywhere]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const DetailList = defineComponent({
  name: 'DetailList',
  props: detailListProps,
  description:
    'Label/value detail rows for a listing detail view: check-in/out times, max guests, policies, owner name.',
  component: DetailListView,
});

const amenityChipsProps = z.object({
  items: z.array(z.string()),
});

function AmenityChipsView({
  props,
}: ComponentRenderProps<z.infer<typeof amenityChipsProps>>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-sand px-2.5 py-1 text-xs text-ink"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

const AmenityChips = defineComponent({
  name: 'AmenityChips',
  props: amenityChipsProps,
  description:
    'Amenity pills for a listing detail view — wifi, breakfast, heating, etc.',
  component: AmenityChipsView,
});

const quoteFormProps = z.object({
  /** Action fired on submit — the form values ride along as event.formState. */
  submit: action(),
  /** Card heading, e.g. "Elegí fechas". */
  title: z.string().optional(),
});

const inputClass =
  'mt-1 w-full rounded-xl border border-sand bg-white px-3 py-2 text-sm text-ink';

function QuoteFormView({ props }: ComponentRenderProps<z.infer<typeof quoteFormProps>>) {
  const triggerAction = useTriggerAction();
  const setFieldValue = useSetFieldValue();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  const onSubmit = () => {
    // The action event's formState comes from the renderer's state store, not
    // from a payload arg — mirror the local inputs into the store first so the
    // host appends them as "Form values: {json}". Top-level keys keep the JSON
    // flat: {checkIn: {value: …}, checkOut: {value: …}, guests: {value: …}}.
    setFieldValue(undefined, undefined, 'checkIn', checkIn);
    setFieldValue(undefined, undefined, 'checkOut', checkOut);
    setFieldValue(undefined, undefined, 'guests', guests);
    void triggerAction(props.title ?? 'Cotizar', undefined, props.submit);
  };

  return (
    <section className="rounded-2xl border border-sand bg-white p-4">
      {props.title ? (
        <p className="font-brand text-lg font-medium leading-tight text-ink">{props.title}</p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-ink-muted">Llegada</span>
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-muted">Salida</span>
          <input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="col-span-2 block">
          <span className="text-xs text-ink-muted">Huéspedes</span>
          <input
            type="number"
            min={1}
            value={guests}
            onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-4">
        <Button fullWidth onPress={onSubmit}>
          Cotizar
        </Button>
      </div>
    </section>
  );
}

const QuoteForm = defineComponent({
  name: 'QuoteForm',
  props: quoteFormProps,
  description:
    'Interactive quote form: check-in/check-out dates and guest count. Render INSTEAD of asking for dates in prose when the Traveler has not given them.',
  component: QuoteFormView,
});

const TONE_CLASS = {
  agua: 'bg-agua-soft text-agua',
  terra: 'bg-terra-soft text-terra-deep',
  amber: 'bg-amber-100 text-amber-800',
  neutral: 'bg-sand/60 text-ink-muted',
} as const;

const statusBadgeProps = z.object({
  label: z.string(),
  tone: z.enum(['agua', 'terra', 'amber', 'neutral']),
});

function Badge({ label, tone }: z.infer<typeof statusBadgeProps>) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

function StatusBadgeView({ props }: ComponentRenderProps<z.infer<typeof statusBadgeProps>>) {
  return <Badge label={props.label} tone={props.tone} />;
}

const StatusBadge = defineComponent({
  name: 'StatusBadge',
  props: statusBadgeProps,
  description:
    'Small status pill. label = a short state taken from real tool data (e.g. a booking or claim status) — never invent a state. tone: agua = done/ok, terra = active/in progress, amber = needs attention (pending payment, open claim), neutral = closed/inactive.',
  component: StatusBadgeView,
});

const stepperProps = z.object({
  steps: z.array(
    z.object({
      label: z.string(),
      status: z.enum(['done', 'current', 'next']),
    }),
  ),
});

function StepperView({ props }: ComponentRenderProps<z.infer<typeof stepperProps>>) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Pasos">
      {props.steps.map((step, i) => (
        <li
          key={`${step.label}-${i}`}
          aria-current={step.status === 'current' ? 'step' : undefined}
          className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-medium ${
            step.status === 'current'
              ? 'bg-terra text-white'
              : step.status === 'done'
                ? 'bg-agua-soft text-agua'
                : 'bg-sand/60 text-ink-muted'
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
              step.status === 'current'
                ? 'bg-white text-terra-deep'
                : step.status === 'done'
                  ? 'bg-agua text-white'
                  : 'bg-paper text-ink-muted'
            }`}
          >
            {step.status === 'done' ? <CheckIcon className="h-3 w-3" /> : i + 1}
          </span>
          {step.label}
          {step.status === 'done' && <span className="sr-only">(listo)</span>}
        </li>
      ))}
    </ol>
  );
}

const Stepper = defineComponent({
  name: 'Stepper',
  props: stepperProps,
  description:
    'Pill progress stepper for a Booking lifecycle (e.g. Pago → Confirmada → Estadía → Finalizada). Exactly one step is "current"; steps before it are "done", after it "next" — derive the current step from the real booking status, never guess.',
  component: StepperView,
});

const metricRowProps = z.object({
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      note: z.string().optional(),
    }),
  ),
});

function MetricRowView({ props }: ComponentRenderProps<z.infer<typeof metricRowProps>>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
      {props.items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className={
            i === 0
              ? 'rounded-2xl bg-terra p-3.5 text-white'
              : 'rounded-2xl border border-sand bg-white p-3.5'
          }
        >
          <p className={`text-xs ${i === 0 ? 'text-white/80' : 'text-ink-muted'}`}>{item.label}</p>
          <p
            className={`mt-1 font-mono text-lg font-semibold tracking-tight ${i === 0 ? '' : 'text-ink'}`}
          >
            {item.value}
          </p>
          {item.note ? (
            <p className={`mt-0.5 text-xs ${i === 0 ? 'text-white/70' : 'text-ink-muted'}`}>
              {item.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const MetricRow = defineComponent({
  name: 'MetricRow',
  props: metricRowProps,
  description:
    'Row of small stat tiles; the first tile is terra-filled as the headline metric. Every value must come verbatim from a tool result (totals, nights, counts) — never compute or invent figures. note = optional short caption under the value.',
  component: MetricRowView,
});

const approvalCardProps = z.object({
  /** The decision to confirm, e.g. "¿Cancelás la reserva bkg_12?". */
  question: z.string(),
  /** 2-4 choices; tone "danger" marks the destructive one (e.g. confirm a cancel). */
  options: z.array(
    z.object({
      label: z.string(),
      /** Semantic value sent back in the form values — defaults to label. */
      value: z.string().optional(),
      tone: z.enum(['default', 'danger']).optional(),
    }),
  ),
  /** Fired by the "Confirmar" button; the picked option arrives as form values choice + value. */
  submit: action(),
  /** Context line under the question, e.g. "Recuperás US$ 195 — el Service fee no vuelve". */
  description: z.string().optional(),
  /** Optional ghost "Ahora no" that fires instead of a choice. */
  dismiss: action().optional(),
});

function ApprovalCardView({
  props,
}: ComponentRenderProps<z.infer<typeof approvalCardProps>>) {
  const triggerAction = useTriggerAction();
  const setFieldValue = useSetFieldValue();
  const [picked, setPicked] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  const send = () => {
    if (picked === null || sent) return;
    const option = props.options[picked];
    // Same flat formState keys as QuoteForm — the host appends them to the
    // action's message as "Form values: {json}". choice = the label the
    // Traveler saw, value = the semantic option value (or the label again).
    setFieldValue(undefined, undefined, 'choice', option.label);
    setFieldValue(undefined, undefined, 'value', option.value ?? option.label);
    setSent(true);
    void triggerAction(option.label, undefined, props.submit);
  };

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-agua-soft px-2.5 py-1 text-xs font-medium text-agua">
        <CheckIcon className="h-3 w-3" />
        Respuesta enviada
      </span>
    );
  }

  return (
    <section className="w-full max-w-80 rounded-2xl border border-sand bg-white p-4">
      <p className="font-brand text-[15px] font-medium text-ink">{props.question}</p>
      {props.description ? (
        <p className="mt-1 text-[13px] leading-snug text-ink-muted">{props.description}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-1" role="radiogroup" aria-label={props.question}>
        {props.options.map((option, i) => {
          const on = picked === i;
          return (
            <button
              key={`${option.label}-${i}`}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(i)}
              className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-left transition-colors hover:bg-sand/50"
            >
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${
                  on
                    ? option.tone === 'danger'
                      ? 'bg-terra-deep'
                      : 'bg-terra'
                    : 'border-[1.5px] border-sand bg-white'
                }`}
              >
                {on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <span
                className={`text-[13px] leading-none ${on ? 'text-ink' : 'text-ink-muted'}`}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-sand pt-3">
        {props.dismiss ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-ink-muted"
            onPress={() => {
              setSent(true);
              void triggerAction('Ahora no', undefined, props.dismiss);
            }}
          >
            Ahora no
          </Button>
        ) : null}
        <Button size="sm" isDisabled={picked === null} onPress={send}>
          Confirmar
        </Button>
      </div>
    </section>
  );
}

const ApprovalCard = defineComponent({
  name: 'ApprovalCard',
  props: approvalCardProps,
  description:
    'Human-in-the-loop confirm: one question, 2-4 radio options, a "Confirmar" button and an optional "Ahora no" dismiss. The pick reaches you as form values {choice: <label>, value: <value>}. Use it for destructive or money-moving decisions (cancel a Booking, confirm before paying) — never to ask for data a tool already returned.',
  component: ApprovalCardView,
});

const taskRowsProps = z.object({
  /** Live status rows — at most one "running" while a stage is in flight. */
  rows: z.array(
    z.object({
      label: z.string(),
      status: z.enum(['done', 'running', 'failed', 'pending']),
      /** Right-side mono detail (a date, amount or count from tool data, verbatim). */
      detail: z.string().optional(),
    }),
  ),
});

const TASK_ROW_PILL = {
  done: { label: 'Listo', className: 'bg-agua-soft text-agua' },
  failed: { label: 'Falló', className: 'bg-terra-deep/10 text-terra-deep' },
} as const;

function TaskRowsView({ props }: ComponentRenderProps<z.infer<typeof taskRowsProps>>) {
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      {props.rows.map((row, i) => {
        const pill = row.status === 'done' || row.status === 'failed' ? TASK_ROW_PILL[row.status] : null;
        return (
          <div
            key={`${row.label}-${i}`}
            className="flex h-11 items-center gap-2.5 rounded-2xl border border-sand bg-white px-2.5"
          >
            <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center">
              {row.status === 'done' ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-agua text-white">
                  <CheckIcon className="h-3 w-3" />
                </span>
              ) : row.status === 'failed' ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terra-deep text-white">
                  <XIcon className="h-2.5 w-2.5" />
                </span>
              ) : row.status === 'running' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-sand border-t-ink-muted" />
              ) : (
                <span className="h-4 w-4 rounded-full border-[1.5px] border-sand" />
              )}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
                row.status === 'pending' ? 'text-ink-muted' : 'text-ink'
              }`}
            >
              {row.label}
            </span>
            {row.detail ? (
              <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-ink-muted">
                {row.detail}
              </span>
            ) : null}
            {pill ? (
              <span
                className={`inline-flex h-5.5 shrink-0 items-center rounded-full px-2 text-[11.5px] font-medium ${pill.className}`}
              >
                {pill.label}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const TaskRows = defineComponent({
  name: 'TaskRows',
  props: taskRowsProps,
  description:
    'Live status list — one row per stage of a Booking lifecycle (Reservada → Pagada → Check-in → Estadía → Fondos liberados) or of in-flight work. status: done = finished, running = in flight right now, failed = ended badly (cancelled, payment failed), pending = still ahead. detail = a date/amount/count from tool data, verbatim.',
  component: TaskRowsView,
});

const recommendationCardProps = z.object({
  /** The recommended option, e.g. "Posada Los Cardones". */
  title: z.string(),
  /** Why this pick — grounded in real tool data (rating, price, fit for dates/guests). */
  description: z.string(),
  /** Honest confidence 0-100 judged from rating and fit — never inflated. */
  confidence: z.number().min(0).max(100),
  /** Fired by the "Elegir" CTA. */
  accept: action(),
  /** Other real options — each fires its own action when tapped. */
  alternatives: z
    .array(
      z.object({
        label: z.string(),
        action: action(),
      }),
    )
    .optional(),
});

function RecommendationCardView({
  props,
}: ComponentRenderProps<z.infer<typeof recommendationCardProps>>) {
  const triggerAction = useTriggerAction();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const bars = Math.max(0, Math.min(3, Math.round((props.confidence / 100) * 3)));
  const tone =
    props.confidence >= 67 ? 'bg-agua' : props.confidence >= 34 ? 'bg-terra' : 'bg-ink-muted';
  return (
    <section className="w-full max-w-sm overflow-hidden rounded-2xl border border-sand bg-white">
      <div className="p-4">
        <p className="font-brand text-[15px] font-medium text-ink">{props.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{props.description}</p>
      </div>
      {props.alternatives?.length ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: open ? '1fr' : '0fr',
            opacity: open ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-sand px-2 py-2">
              <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-muted">Otras opciones</p>
              {props.alternatives.map((alt, i) => (
                <button
                  key={`${alt.label}-${i}`}
                  type="button"
                  onClick={() => {
                    setDone(true);
                    void triggerAction(alt.label, undefined, alt.action);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-full px-1.5 py-1.5 text-left transition-colors hover:bg-sand/50"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {alt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-sand px-4 py-3">
        <span className="flex items-center gap-2">
          <span aria-hidden className="flex items-end gap-0.5">
            {[0, 1, 2].map((bar) => (
              <span
                key={bar}
                className={`w-1 rounded-full ${bar < bars ? tone : 'bg-sand'}`}
                style={{ height: 10 }}
              />
            ))}
          </span>
          <span className="text-[12.5px] font-medium text-ink-muted">
            {props.confidence}% confianza
          </span>
        </span>
        <span className="flex items-center gap-2">
          {props.alternatives?.length ? (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={open}
              onPress={() => setOpen((current) => !current)}
            >
              Alternativas
            </Button>
          ) : null}
          <Button
            size="sm"
            isDisabled={done}
            onPress={() => {
              setDone(true);
              void triggerAction('Elegir', undefined, props.accept);
            }}
          >
            {done ? 'Aceptado' : 'Elegir'}
          </Button>
        </span>
      </div>
    </section>
  );
}

const RecommendationCard = defineComponent({
  name: 'RecommendationCard',
  props: recommendationCardProps,
  description:
    'One top pick after a search: title + why, a 0-100 confidence meter, an "Elegir" CTA and an "Alternativas" drawer of other real options. Emit at most ONE per reply and only when one result is clearly stronger — confidence must come from rating/fit, never invented.',
  component: RecommendationCardView,
});

const BOOKING_STATUS = {
  pending_payment: { label: 'Pago pendiente', tone: 'amber' },
  confirmed: { label: 'Confirmada', tone: 'agua' },
  in_progress: { label: 'En curso', tone: 'terra' },
  completed: { label: 'Finalizada', tone: 'neutral' },
  claim_open: { label: 'Reclamo abierto', tone: 'amber' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  refunded: { label: 'Reembolsada', tone: 'neutral' },
} as const;

const bookingCardProps = z.object({
  /** e.g. "Departamento familiar en San Blas". */
  title: z.string(),
  /** Booking id returned by book_listing, e.g. "bkg_1". */
  code: z.string(),
  lines: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ),
  /** The Booking's real status; omitted = freshly confirmed. */
  status: z
    .enum(['pending_payment', 'confirmed', 'in_progress', 'completed', 'claim_open', 'cancelled', 'refunded'])
    .optional(),
  /** Fired by the "Cancelar reserva" button — only for a cancellable Booking. */
  cancel: action().optional(),
});

function BookingCardView({ props }: ComponentRenderProps<z.infer<typeof bookingCardProps>>) {
  const triggerAction = useTriggerAction();
  const status = BOOKING_STATUS[props.status ?? 'confirmed'];
  return (
    <section
      aria-label={`Reserva ${status.label.toLowerCase()}: ${props.title}`}
      className="overflow-hidden rounded-2xl border border-sand bg-white"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="font-brand text-lg font-medium leading-tight text-ink">{props.title}</p>
          <p className="mt-0.5 font-mono text-xs tracking-widest text-ink-muted">{props.code}</p>
        </div>
        <Badge label={status.label} tone={status.tone} />
      </div>
      <dl className="mt-1 divide-y divide-sand px-4 pb-2">
        {props.lines.map((line) => (
          <div
            key={line.label}
            className="flex items-baseline justify-between gap-4 py-2.5 text-sm text-ink"
          >
            <dt className="text-ink-muted">{line.label}</dt>
            <dd className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
      {props.cancel ? (
        <div className="border-t-2 border-dashed border-sand px-4 py-2.5">
          <Button
            size="sm"
            variant="ghost"
            className="text-ink-muted"
            onPress={() => void triggerAction('Cancelar reserva', undefined, props.cancel)}
          >
            Cancelar reserva
          </Button>
        </div>
      ) : null}
    </section>
  );
}

const BookingCard = defineComponent({
  name: 'BookingCard',
  props: bookingCardProps,
  description:
    'Booking ticket — only after a real book_listing / booking-status result. code = the booking id (e.g. bkg_1). status = the Booking\'s status field verbatim (omit right after booking = confirmed); never invent one. cancel = only when the Booking is still cancellable (pending_payment or confirmed, before check-in); omit it otherwise.',
  component: BookingCardView,
});

const mapCardProps = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string(),
  zoom: z.number().optional(),
});

function MapCardView({ props }: ComponentRenderProps<z.infer<typeof mapCardProps>>) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-sand bg-white">
      <div className="relative z-0 h-44">
        <MapCardMap lat={props.lat} lng={props.lng} label={props.label} zoom={props.zoom ?? 15} />
      </div>
      <figcaption className="px-4 py-2.5 text-sm text-ink-muted">{props.label}</figcaption>
    </figure>
  );
}

const MapCard = defineComponent({
  name: 'MapCard',
  props: mapCardProps,
  description:
    'Map with a terra pin at a listing\'s exact location. lat/lng = the listing\'s lat/lng from get_listing verbatim — if the listing has no coordinates, do NOT render a MapCard (never estimate them). label = listing name or address. zoom optional (default 15).',
  component: MapCardView,
});

const availabilityPickerProps = z.object({
  /** ISO nights already taken, from the listing's availability. */
  occupied: z.array(z.string()),
  /** Fired once a check-in → check-out range is picked; dates ride along as formState. */
  submit: action(),
});

function AvailabilityPickerView({
  props,
}: ComponentRenderProps<z.infer<typeof availabilityPickerProps>>) {
  const triggerAction = useTriggerAction();
  const setFieldValue = useSetFieldValue();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [range, setRange] = useState<{ checkIn: string | null; checkOut: string | null }>({
    checkIn: null,
    checkOut: null,
  });
  const occupied = [...props.occupied].sort();

  const onChange = (checkIn: string | null, checkOut: string | null) => {
    setRange({ checkIn, checkOut });
    if (!checkIn || !checkOut) return;
    // Same flat top-level keys as QuoteForm: {checkIn: {value}, checkOut: {value}}.
    setFieldValue(undefined, undefined, 'checkIn', checkIn);
    setFieldValue(undefined, undefined, 'checkOut', checkOut);
    void triggerAction(`Fechas: ${checkIn} → ${checkOut}`, undefined, props.submit);
  };

  return (
    <section className="max-w-sm rounded-2xl border border-sand bg-white p-3">
      <AvailabilityCalendar
        occupied={occupied}
        today={today}
        checkIn={range.checkIn}
        checkOut={range.checkOut}
        onChange={onChange}
      />
    </section>
  );
}

const AvailabilityPicker = defineComponent({
  name: 'AvailabilityPicker',
  props: availabilityPickerProps,
  description:
    'Month calendar to pick check-in → check-out on a listing\'s real availability; occupied nights are grayed and a range can\'t cross one. occupied = the listing\'s occupied ISO nights (YYYY-MM-DD) from the availability tool verbatim — pass [] only if the tool returned none, never invent dates. On a completed range it fires submit with formState checkIn + checkOut.',
  component: AvailabilityPickerView,
});

const CLAIM_REASONS = [
  { value: 'no_access', label: 'No pude acceder al alojamiento' },
  { value: 'not_as_described', label: 'No es como se describía' },
  { value: 'owner_no_show', label: 'El dueño no se presentó' },
] as const;

const claimCardProps = z.object({
  /** Booking id the Claim is opened against, e.g. "bkg_12". */
  bookingId: z.string(),
  /** Fired on send; reason + evidence ride along as formState. */
  submit: action(),
});

function ClaimCardView({ props }: ComponentRenderProps<z.infer<typeof claimCardProps>>) {
  const triggerAction = useTriggerAction();
  const setFieldValue = useSetFieldValue();
  const [reason, setReason] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');

  const onSubmit = () => {
    if (!reason) return;
    setFieldValue(undefined, undefined, 'reason', reason);
    setFieldValue(undefined, undefined, 'evidence', evidence.trim());
    void triggerAction('Abrir reclamo', undefined, props.submit);
  };

  return (
    <section
      aria-label={`Reclamo para la reserva ${props.bookingId}`}
      className="rounded-2xl border border-sand bg-white p-4"
    >
      <p className="font-brand text-lg font-medium leading-tight text-ink">Abrir un reclamo</p>
      <p className="mt-0.5 font-mono text-xs tracking-widest text-ink-muted">{props.bookingId}</p>
      <fieldset className="mt-3">
        <legend className="text-xs text-ink-muted">¿Qué pasó?</legend>
        <div className="mt-1.5 flex flex-col gap-2">
          {CLAIM_REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                reason === r.value ? 'border-terra bg-terra-soft text-terra-deep' : 'border-sand text-ink hover:bg-paper'
              }`}
            >
              <input
                type="radio"
                name={`claim-reason-${props.bookingId}`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-terra"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block">
        <span className="text-xs text-ink-muted">Contanos qué pasó (evidencia)</span>
        <textarea
          rows={3}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          className={`${inputClass} resize-none`}
        />
      </label>
      <div className="mt-4">
        <Button fullWidth isDisabled={!reason} onPress={onSubmit}>
          Abrir reclamo
        </Button>
      </div>
    </section>
  );
}

const ClaimCard = defineComponent({
  name: 'ClaimCard',
  props: claimCardProps,
  description:
    'Claim form for a Booking: the Traveler picks one of 3 fixed reasons (no_access, not_as_described, owner_no_show) and writes evidence; fires submit with formState reason + evidence. bookingId = the real booking id (e.g. bkg_12) — only render for a Booking the Traveler actually has, within the Claim window.',
  component: ClaimCardView,
});

const tableProps = z.object({
  /** Header labels — the first column heads the row-label column (often ""). */
  columns: z.array(z.string()),
  /** Body rows; each row should have one cell per column. */
  rows: z.array(z.array(z.string())),
});

function TableView({ props }: ComponentRenderProps<z.infer<typeof tableProps>>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-sand bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-sand">
            {props.columns.map((col, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand">
          {props.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2.5 text-sm text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Table = defineComponent({
  name: 'Table',
  props: tableProps,
  description: 'Compare 2-4 listings side by side — first column is the row label.',
  component: TableView,
});

const stackProps = z.object({
  children: z.array(
    z.union([
      z.string(),
      TextContent.ref,
      ListingCard.ref,
      ListingCarousel.ref,
      QuoteCard.ref,
      ImageGrid.ref,
      SectionHeader.ref,
      ChipRow.ref,
      DetailList.ref,
      AmenityChips.ref,
      QuoteForm.ref,
      BookingCard.ref,
      Table.ref,
      MapCard.ref,
      StatusBadge.ref,
      Stepper.ref,
      AvailabilityPicker.ref,
      ClaimCard.ref,
      MetricRow.ref,
      ApprovalCard.ref,
      TaskRows.ref,
      RecommendationCard.ref,
    ]),
  ),
  direction: z.enum(['column', 'row']).optional(),
  gap: z.enum(['sm', 'md', 'lg']).optional(),
});

function StackView({ props, renderNode }: ComponentRenderProps<z.infer<typeof stackProps>>) {
  return (
    <div
      className={`mt-3 flex ${props.direction === 'row' ? 'flex-row flex-wrap' : 'flex-col'} ${
        GAP_CLASS[props.gap ?? 'md']
      }`}
    >
      {renderNode(props.children)}
    </div>
  );
}

const Stack = defineComponent({
  name: 'Stack',
  props: stackProps,
  description:
    'Root layout container every program starts with: stacks children vertically (default) or horizontally with a gap.',
  component: StackView,
});

export const library = createLibrary({
  root: 'Stack',
  components: [
    Stack,
    TextContent,
    ListingCard,
    ListingCarousel,
    QuoteCard,
    ImageGrid,
    SectionHeader,
    ChipRow,
    DetailList,
    AmenityChips,
    QuoteForm,
    BookingCard,
    Table,
    MapCard,
    StatusBadge,
    Stepper,
    AvailabilityPicker,
    ClaimCard,
    MetricRow,
    ApprovalCard,
    TaskRows,
    RecommendationCard,
  ],
  componentGroups: [
    { name: 'Layout', components: ['Stack', 'TextContent'] },
    {
      name: 'nomai',
      components: [
        'ListingCard',
        'ListingCarousel',
        'QuoteCard',
        'ImageGrid',
        'SectionHeader',
        'ChipRow',
        'DetailList',
        'AmenityChips',
        'QuoteForm',
        'BookingCard',
        'Table',
        'MapCard',
        'StatusBadge',
        'Stepper',
        'AvailabilityPicker',
        'ClaimCard',
        'MetricRow',
        'ApprovalCard',
        'TaskRows',
        'RecommendationCard',
      ],
    },
  ],
});

/**
 * Picked up by `openui generate --spec` into `openui.spec.json.promptOptions`.
 * Inline mode = normal prose replies with optional fenced openui-lang blocks.
 */
export const promptOptions: PromptOptions = { inlineMode: true };
