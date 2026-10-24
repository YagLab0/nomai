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
  useTriggerAction,
  type ComponentRenderProps,
  type PromptOptions,
} from '@openuidev/react-lang';
import { z } from 'zod/v4';

import { ProseText } from '@/components/app/chat/prose-text';

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
});

function QuoteCardView({ props }: ComponentRenderProps<z.infer<typeof quoteCardProps>>) {
  const triggerAction = useTriggerAction();
  return (
    <section
      aria-label={`Detalle de reserva: ${props.title}`}
      className="overflow-hidden rounded-2xl border border-sand bg-white"
    >
      <p className="px-4 pb-1 pt-3.5 font-brand text-lg font-medium leading-tight text-ink">
        {props.title}
      </p>
      <dl className="divide-y divide-sand px-4">
        {props.lines.map((line) => (
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
    'An itemized booking quote (subtotal, conversion, FX fee, total) with a dashed ticket footer and a "Confirmar reserva" button. Only render after a real quote_booking result — never invent lines.',
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

const stackProps = z.object({
  children: z.array(
    z.union([z.string(), TextContent.ref, ListingCard.ref, QuoteCard.ref, ImageGrid.ref]),
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
  components: [Stack, TextContent, ListingCard, QuoteCard, ImageGrid],
  componentGroups: [
    { name: 'Layout', components: ['Stack', 'TextContent'] },
    { name: 'nomai', components: ['ListingCard', 'QuoteCard', 'ImageGrid'] },
  ],
});

/**
 * Picked up by `openui generate --spec` into `openui.spec.json.promptOptions`.
 * Inline mode = normal prose replies with optional fenced openui-lang blocks.
 */
export const promptOptions: PromptOptions = { inlineMode: true };
