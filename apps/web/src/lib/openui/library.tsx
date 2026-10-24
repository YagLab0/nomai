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
import { useState } from 'react';
import { z } from 'zod/v4';

import { ProseText } from '@/components/app/chat/prose-text';
import { CheckIcon } from '@/components/icons';
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
  /** Trust chip, e.g. "directo con el dueño". */
  badge: z.string().optional(),
  choose: action(),
  blurb: z.string().optional(),
  /** Three-letter ticket code for the stub column, e.g. "CFY". */
  code: z.string().optional(),
  /** Photo URL — always the listing's cover_photo returned by the API, verbatim. */
  image: z.string().optional(),
});

function ListingCardView({ props }: ComponentRenderProps<z.infer<typeof listingCardProps>>) {
  const triggerAction = useTriggerAction();
  return (
    <article className="flex overflow-hidden rounded-2xl border border-sand bg-white">
      {props.image ? (
        <img
          src={props.image}
          alt={props.name}
          className="w-28 shrink-0 object-cover sm:w-36"
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 flex-1 p-4">
        <p className="font-brand text-lg font-medium leading-tight text-ink">{props.name}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{props.city}</p>
        {props.blurb ? <p className="mt-2 text-sm leading-snug text-ink">{props.blurb}</p> : null}
        {props.badge ? (
          <span className="mt-3 inline-flex rounded-full bg-agua-soft px-2.5 py-0.5 text-xs font-medium text-agua">
            {props.badge}
          </span>
        ) : null}
      </div>

      <div className="relative flex w-32 shrink-0 flex-col items-center justify-between gap-2 border-l-2 border-dashed border-sand p-3 text-center sm:w-36">
        <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper" />
        <span aria-hidden="true" className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-paper" />
        {props.code ? (
          <span className="font-mono text-xs tracking-widest text-ink-muted">{props.code}</span>
        ) : null}
        <p className="font-mono text-sm font-semibold text-ink">{props.price}</p>
        <Button
          size="sm"
          fullWidth
          onPress={() => void triggerAction('Elegir', undefined, props.choose)}
        >
          Elegir
        </Button>
      </div>
    </article>
  );
}

const ListingCard = defineComponent({
  name: 'ListingCard',
  props: listingCardProps,
  description:
    'A lodging option as a ticket-stub card: name, city and optional blurb on the left; a perforated stub with the nightly price and an "Elegir" button on the right. Only with real data from the listings tools.',
  component: ListingCardView,
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
            <dd className="shrink-0 font-mono">{line.value}</dd>
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
    'Photo mosaic for a single listing detail: one large cover image plus up to 3 thumbnails. Use after get_listing with the photos[].url values — never invent URLs.',
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
          <dt className="text-ink-muted">{item.label}</dt>
          <dd className="shrink-0 text-right font-medium text-ink">{item.value}</dd>
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
            <dd className="shrink-0 font-mono">{line.value}</dd>
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
  ],
  componentGroups: [
    { name: 'Layout', components: ['Stack', 'TextContent'] },
    {
      name: 'nomai',
      components: [
        'ListingCard',
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
      ],
    },
  ],
});

/**
 * Picked up by `openui generate --spec` into `openui.spec.json.promptOptions`.
 * Inline mode = normal prose replies with optional fenced openui-lang blocks.
 */
export const promptOptions: PromptOptions = { inlineMode: true };
