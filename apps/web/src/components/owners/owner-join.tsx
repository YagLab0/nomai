'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  FieldError,
  Header,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
} from '@heroui/react';

import { AuthForm } from '@/components/auth/auth-form';
import { CheckIcon, MinusIcon, PlusIcon } from '@/components/icons';
import { KIND_LABEL, LODGING_KINDS, NORTE_TOWNS, RIPIO_COUNTRIES_TEXT, type LodgingKind } from '@/lib/lodgings';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';

/**
 * Owner onboarding, UI only (no backend): phone → Lodging → Ripio → done.
 * Every Booking for the Owner's Lodgings is paid straight into the linked Ripio
 * account (ADR-0001), so nomai never holds the money.
 */

const FAKE_LATENCY_MS = 1000;
const RIPIO_SIGNUP_URL = 'https://www.ripio.com';

const STEPS = ['Tu teléfono', 'Tu alojamiento', 'Cobros con Ripio', 'Listo'] as const;
type Step = 0 | 1 | 2 | 3;

const MORE_NORTE = ['Cachi', 'Iruya', 'San Salvador de Jujuy'];

/** Towns by Ripio country (Owners get paid through Ripio, so only these). Norte first. */
const TOWN_GROUPS: { label: string; towns: string[] }[] = [
  { label: 'Norte argentino', towns: [...NORTE_TOWNS, ...MORE_NORTE] },
  { label: 'Resto de Argentina', towns: ['Buenos Aires', 'Mendoza', 'Bariloche'] },
  { label: 'Brasil', towns: ['Florianópolis', 'Río de Janeiro', 'Salvador'] },
  { label: 'Chile', towns: ['San Pedro de Atacama', 'Santiago', 'Valparaíso'] },
  { label: 'Colombia', towns: ['Cartagena', 'Bogotá', 'Medellín'] },
  { label: 'México', towns: ['Tulum', 'Ciudad de México', 'Oaxaca'] },
  { label: 'Perú', towns: ['Cusco', 'Lima', 'Arequipa'] },
  { label: 'Uruguay', towns: ['Colonia del Sacramento', 'Montevideo', 'Punta del Este'] },
];

/** What the mock import "finds" behind any Booking or Airbnb link. */
const IMPORTED = { name: 'Casa del Algarrobo Viejo', kind: 'casa' as LodgingKind, town: 'Cafayate', capacity: 4 };

interface LodgingDraft {
  name: string;
  kind: LodgingKind;
  town: string;
  capacity: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function importSource(url: string): 'Booking' | 'Airbnb' | null {
  const u = url.toLowerCase();
  if (/(^|\.|\/)booking\.com/.test(u)) return 'Booking';
  if (/(^|\.|\/)airbnb\.[a-z.]+/.test(u)) return 'Airbnb';
  return null;
}

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Pasos">
      {STEPS.map((label, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'next';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-medium ${
              state === 'current' ? 'bg-terra text-white' : state === 'done' ? 'bg-agua-soft text-agua' : 'bg-sand/60 text-ink-muted'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                state === 'current' ? 'bg-white text-terra-deep' : state === 'done' ? 'bg-agua text-white' : 'bg-paper text-ink-muted'
              }`}
            >
              {state === 'done' ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {label}
            {state === 'done' && <span className="sr-only">(listo)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function PhoneStep({ onDone }: { onDone: () => void }) {
  const [currentUser, setCurrentUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    // Demo mode: no Supabase — stay on the mock WhatsApp verification.
    if (!hasSupabaseEnv) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUser({ email: data.user.email });
      }
    });
  }, []);

  return (
    <div>
      {currentUser ? (
        <div className="mb-6 rounded-[1.25rem] bg-agua-soft p-5 text-ink">
          <p className="font-brand text-lg font-medium text-ink">
            Sesión iniciada como <span className="font-semibold">{currentUser.email}</span>
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Tu nuevo perfil de dueño se vinculará directamente a tu cuenta.
          </p>
          <Button className="mt-4" size="md" onPress={onDone}>
            Continuar con tu alojamiento
          </Button>
        </div>
      ) : (
        <p className="mb-8 rounded-[1.25rem] bg-agua-soft px-4 py-3 text-[15px] text-ink">
          ¿Ya tenés cuenta en nomai?{' '}
          <Link
            href="/login?next=/owners/join"
            className="font-medium text-terra-deep underline underline-offset-4"
          >
            Iniciá sesión aquí
          </Link>{' '}
          o verificá tu teléfono para sumar tu perfil de dueño.
        </p>
      )}
      {!currentUser && <AuthForm mode="owner" onVerified={onDone} />}
    </div>
  );
}

function LodgingStep({
  draft,
  setDraft,
  onDone,
}: {
  draft: LodgingDraft;
  setDraft: (d: LodgingDraft) => void;
  onDone: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const source = importSource(url);
  const nameInvalid = draft.name.trim().length < 3;
  const townInvalid = !draft.town;

  async function runImport() {
    if (!source || importing) return;
    setImporting(true);
    await wait(FAKE_LATENCY_MS);
    setDraft(IMPORTED);
    setImported(source);
    setImporting(false);
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameInvalid || townInvalid) return;
    onDone();
  }

  return (
    <form noValidate onSubmit={next}>
      <h2 className="font-brand text-3xl font-medium leading-tight text-ink">Tu alojamiento</h2>
      <p className="mt-2 text-ink-muted">Lo básico para que Nomito pueda recomendarlo. El resto lo completás después.</p>

      <div className="mt-8 rounded-card border-2 border-dashed border-sand p-5">
        <TextField value={url} onChange={setUrl} isDisabled={importing}>
          <Label>Importar desde Booking o Airbnb (opcional)</Label>
          <div className="mt-1 flex gap-2">
            <Input fullWidth type="url" inputMode="url" placeholder="https://www.airbnb.com.ar/rooms/…" className="min-w-0 flex-1" />
            <Button variant="secondary" isDisabled={!source || importing} isPending={importing} onPress={runImport}>
              {({ isPending }) => (
                <>
                  {isPending && <Spinner color="current" size="sm" />}
                  Importar
                </>
              )}
            </Button>
          </div>
        </TextField>
        <p aria-live="polite" className="mt-2 text-sm text-ink-muted">
          {imported
            ? `Listo: trajimos tu alojamiento desde ${imported}. Revisá que los datos estén bien.`
            : url && !source
              ? 'Pegá el link de tu alojamiento en Booking o Airbnb.'
              : 'Traemos nombre, tipo, ubicación y capacidad para que no cargues nada dos veces.'}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <TextField
          isRequired
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
          isInvalid={touched && nameInvalid}
        >
          <Label>Nombre del alojamiento</Label>
          <Input fullWidth placeholder="Posada El Algarrobo" />
          <FieldError>Escribí el nombre, como lo conocen tus huéspedes.</FieldError>
        </TextField>

        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            selectedKey={draft.kind}
            onSelectionChange={(k) => k && setDraft({ ...draft, kind: k as LodgingKind })}
          >
            <Label>Tipo</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {LODGING_KINDS.map((k) => (
                  <ListBox.Item key={k.id} id={k.id} textValue={KIND_LABEL[k.id]}>
                    {KIND_LABEL[k.id]}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            isRequired
            placeholder="Elegí el pueblo"
            selectedKey={draft.town || null}
            onSelectionChange={(k) => setDraft({ ...draft, town: k ? String(k) : '' })}
            isInvalid={touched && townInvalid}
          >
            <Label>Pueblo o ciudad</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {TOWN_GROUPS.map((g) => (
                  <ListBox.Section key={g.label}>
                    <Header>{g.label}</Header>
                    {g.towns.map((t) => (
                      <ListBox.Item key={t} id={t} textValue={t}>
                        {t}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox.Section>
                ))}
              </ListBox>
            </Select.Popover>
            <FieldError>Elegí dónde queda.</FieldError>
          </Select>
        </div>

        <div>
          <p id="capacity-label" className="text-sm font-medium text-ink">
            Capacidad
          </p>
          <div role="group" aria-labelledby="capacity-label" className="mt-2 flex items-center gap-3">
            <button
              type="button"
              aria-label="Una persona menos"
              disabled={draft.capacity <= 1}
              onClick={() => setDraft({ ...draft, capacity: Math.max(1, draft.capacity - 1) })}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <output aria-live="polite" className="min-w-[6.5rem] text-center text-ink">
              hasta <span className="font-semibold">{draft.capacity}</span> {draft.capacity === 1 ? 'persona' : 'personas'}
            </output>
            <button
              type="button"
              aria-label="Una persona más"
              disabled={draft.capacity >= 30}
              onClick={() => setDraft({ ...draft, capacity: Math.min(30, draft.capacity + 1) })}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <Button type="submit" size="lg" fullWidth className="mt-8">
        Seguir
      </Button>
    </form>
  );
}

const RIPIO_POINTS = [
  'Cobrás apenas el viajero confirma, no a 30 o 60 días.',
  'En tu moneda: el viajero paga en la suya y a vos te llega en la tuya.',
  'Sin comisión, ni ahora ni después. Lo que cobra el alojamiento es tuyo.',
];

function RipioStep({
  draft,
  onDone,
}: {
  draft: LodgingDraft;
  onDone: (business: { slug: string; name: string }) => void;
}) {
  const [state, setState] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function connect() {
    setState('connecting');
    await wait(FAKE_LATENCY_MS + 400);
    setState('connected');
  }

  async function finish() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      // No payoutAddress: the form doesn't collect one (the Ripio "connect"
      // above is mocked). The business is created with payout_address = null;
      // the Owner sets it later from the dashboard (update-payout action).
      const res = await fetch('/api/owners/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          kind: draft.kind,
          town: draft.town,
          capacity: draft.capacity,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.business) {
        onDone({ slug: data.business.slug, name: data.business.name });
      } else {
        // Demo lever (D7): advance anyway pointing at the seeded Owner so the
        // wizard can be walked end-to-end without a session — but surface the
        // real failure instead of swallowing it.
        console.warn('[owner-join] onboard failed, using demo owner fallback', {
          status: res.status,
          error: (data as { error?: string }).error ?? null,
        });
        onDone({ slug: 'ramon-guaymas', name: draft.name || 'Tu alojamiento' });
      }
    } catch (err) {
      console.warn('[owner-join] onboard request failed, using demo owner fallback', err);
      onDone({ slug: 'ramon-guaymas', name: draft.name || 'Tu alojamiento' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="font-brand text-3xl font-medium leading-tight text-ink">Conectá tu cuenta de Ripio</h2>
      <p className="mt-2 text-ink-muted">
        Las reservas de {draft.name || 'tu alojamiento'} se pagan directo en tu cuenta de Ripio. nomai no toca la plata
        en ningún momento.
      </p>

      {errorMsg && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {RIPIO_POINTS.map((p) => (
          <li key={p} className="flex gap-3 text-[15px] leading-snug text-ink">
            <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-agua text-white">
              <CheckIcon className="h-3 w-3" />
            </span>
            {p}
          </li>
        ))}
      </ul>

      <div aria-live="polite" className="mt-8">
        {state === 'connected' ? (
          <div className="flex items-start justify-between gap-4 rounded-card bg-agua-soft p-5">
            <div className="flex gap-3">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-agua text-white">
                <CheckIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-brand text-xl font-medium text-ink">Cuenta de Ripio conectada</p>
                <p className="mt-0.5 text-sm text-ink-muted">0x3a5c…8a1c · Cada reserva te llega acá al instante.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="shrink-0 rounded-md text-sm font-medium text-terra-deep underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <Button size="lg" fullWidth isPending={state === 'connecting'} onPress={connect}>
            {({ isPending }) => (
              <>
                {isPending && <Spinner color="current" size="sm" />}
                {isPending ? 'Conectando con Ripio…' : 'Conectar con Ripio'}
              </>
            )}
          </Button>
        )}
      </div>

      {state !== 'connected' && (
        <p className="mt-4 text-center text-sm text-ink-muted">
          Ripio funciona en {RIPIO_COUNTRIES_TEXT}.{' '}
          ¿No tenés cuenta?{' '}
          <a
            href={RIPIO_SIGNUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-terra-deep underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
          >
            Creala en Ripio
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        </p>
      )}

      <Button
        size="lg"
        fullWidth
        variant={state === 'connected' ? 'primary' : 'secondary'}
        isDisabled={state !== 'connected' || submitting}
        isPending={submitting}
        onPress={finish}
        className="mt-6"
      >
        {({ isPending }) => (
          <>
            {isPending && <Spinner color="current" size="sm" />}
            {isPending ? 'Creando tu perfil…' : 'Terminar'}
          </>
        )}
      </Button>
    </div>
  );
}

function DoneStep({
  draft,
  business,
}: {
  draft: LodgingDraft;
  business?: { slug: string; name: string } | null;
}) {
  const slug = business?.slug || 'ramon-guaymas';
  const name = business?.name || draft.name || 'tu alojamiento';

  return (
    <div>
      <h2 className="brand-display text-4xl font-medium leading-tight text-ink">Listo, ya estás en nomai</h2>
      <p className="mt-2 text-ink-muted">
        Revisamos los datos y en menos de un día tu alojamiento aparece para los viajeros de Nomito.
      </p>

      <div className="mt-8 flex overflow-hidden rounded-card border border-sand bg-white">
        <div className="min-w-0 flex-1 p-5">
          <p className="text-sm text-ink-muted">
            {KIND_LABEL[draft.kind]} · {draft.town}
          </p>
          <p className="font-brand text-2xl font-medium leading-snug text-ink">{draft.name}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Hasta {draft.capacity} {draft.capacity === 1 ? 'persona' : 'personas'}
          </p>
        </div>
        <div className="relative flex w-36 flex-col items-center justify-center gap-1 border-l-2 border-dashed border-sand p-4 text-center">
          <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper" />
          <span aria-hidden="true" className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-paper" />
          <span className="text-xs text-ink-muted">Cobro</span>
          <span className="font-medium text-ink">Ripio</span>
          <span className="rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">sin comisión</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/app/owner"
          className="inline-flex h-12 items-center justify-center rounded-full bg-terra px-7 text-base font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
        >
          Ir a tu panel
        </Link>
        <Link
          href={`/owners/${slug}`}
          className="inline-flex h-12 items-center justify-center rounded-full border border-terra/40 px-7 text-base font-medium text-terra-deep transition-colors hover:bg-terra-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
        >
          Ver cómo se ve tu página
        </Link>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        {business
          ? `Tu perfil "${name}" está listo con estado inicial en revisión.`
          : `Mientras armamos la tuya, podés explorar cómo se ve la página de un dueño de nomai.`}
      </p>
    </div>
  );
}

export function OwnerJoin() {
  const [step, setStep] = useState<Step>(0);
  const [draft, setDraft] = useState<LodgingDraft>({ name: '', kind: 'posada', town: '', capacity: 2 });
  const [business, setBusiness] = useState<{ slug: string; name: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Each step swaps the panel's content: move focus there so it's announced.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panel.current?.focus();
  }, [step]);

  return (
    <div className="flex flex-col gap-8">
      <Stepper step={step} />
      <div ref={panel} tabIndex={-1} className="rounded-panel bg-white p-6 outline-none sm:p-10">
        {step === 0 && <PhoneStep onDone={() => setStep(1)} />}
        {step === 1 && <LodgingStep draft={draft} setDraft={setDraft} onDone={() => setStep(2)} />}
        {step === 2 && (
          <RipioStep
            draft={draft}
            onDone={(bus) => {
              setBusiness(bus);
              setStep(3);
            }}
          />
        )}
        {step === 3 && <DoneStep draft={draft} business={business} />}
      </div>
    </div>
  );
}
