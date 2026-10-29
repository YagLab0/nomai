'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  toast,
} from '@heroui/react';

import { AlojamientoCard } from '@/components/owners/alojamiento-card';
import { LodgingWizard } from '@/components/owners/lodging-wizard';
import { OwnerReviewsSection } from '@/components/owners/owner-reviews';
import { ReservaCard, type BookingData } from '@/components/owners/reserva-card';
import type { ApiOwnerReviews } from '@/lib/api';
import { formatMoney, formatShortDate } from '@/lib/format';
import {
  apiCityCode,
  apiKind,
  apiTone,
  initialsFor,
} from '@/lib/api-mapping';
import { RIPIO_COUNTRIES, type Fiat, type Lodging, type Owner } from '@/lib/lodgings';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type BusinessRow = Database['public']['Tables']['businesses']['Row'];

/** One Lodging as `GET /api/owners/lodgings` serves it: row + rules. */
interface OwnerLodgingRow {
  id: string;
  slug: string;
  title: string;
  status: Lodging['status'];
  base_price_minor: number;
  currency: string;
  kind: string;
  max_guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  summary: string | null;
  description: string | null;
  rating: number | null;
  reviews: number | null;
  canRelocate: boolean;
  canRemove: boolean;
  property: {
    id: string;
    name: string;
    city: string;
    region: string | null;
    country_code: string;
    address_line1: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string;
    property_type: string;
  } | null;
  photos: { url: string; alt_text: string | null; position: number; is_cover: boolean }[];
  amenities: { code: string; name: string }[];
}

interface OwnerDashboardProps {
  userId: string;
  userEmail?: string;
  userName?: string;
}

const MINOR_UNIT = 1_000_000;

/** The payout state as GET /api/owners/payout serves it (#68). */
interface PayoutState {
  network: string;
  explorer: string;
  address: string | null;
  address_set_at: string | null;
  verified_at: string | null;
  verification: {
    id: string;
    status: 'pending' | 'verified' | 'failed' | 'expired' | 'cancelled';
    token: string;
    currency: string;
    tx_hash: string | null;
    attempts_left: number;
    expires_at: string;
  } | null;
}

/** A user-facing line under the modal's forms. */
interface PayoutNotice {
  tone: 'info' | 'error' | 'success';
  text: string;
}

const trimAddress = (a?: string | null) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';

const shortStamp = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '';

/**
 * The verification modal (issue #68): the Owner's Ripio deposit address can
 * not sign — an exchange account is proven by a test deposit. The modal
 * walks the three steps: copiar la dirección en Ripio (red Celo), pegarla
 * acá, y escribir el monto que llegó. Writes go through the /api/owners
 * proxies — PostgREST can't write payout_address anymore.
 */
function PayoutModal({
  isOpen,
  onOpenChange,
  payout,
  currency,
  onChanged,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  payout: PayoutState | null;
  currency: string;
  onChanged: () => Promise<void>;
}) {
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'save' | 'confirm' | null>(null);
  const [notice, setNotice] = useState<PayoutNotice | null>(null);

  const status = payout?.verification?.status ?? null;
  const verified = Boolean(payout?.address && payout?.verified_at);
  const pending = status === 'pending';
  // The guide's currency: the verification's once in flight, else the
  // Lodgings' currency — the same fiat the api resolves (business → wFIAT).
  const fiat = payout?.verification?.currency ?? currency;
  const wToken = payout?.verification?.token ?? `w${fiat}`;
  const explorer = payout?.explorer ?? 'https://celoscan.io';

  const isValid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());
  const amountOk = /^\d+([.,]\d{1,2})?$/.test(amount.trim()) && Number(amount.replace(',', '.')) > 0;
  // Address entry shows when there is none stored, or the Owner chose to
  // change it — from any state.
  const showAddressForm = !pending && (editing || !payout?.address);
  const startLabel = editing || !payout?.address ? 'Guardar y verificar' : 'Verificar';

  async function callApi(path: string, method: string, body?: unknown) {
    const res = await fetch(`/api/owners/payout${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  /** PUT the address (only when it actually changed) then POST verify. */
  async function handleStart() {
    if (busy) return;
    const next = address.trim();
    if (showAddressForm && !isValid) return;
    setBusy('save');
    setNotice(null);
    try {
      if (showAddressForm && next.toLowerCase() !== payout?.address?.toLowerCase()) {
        const put = await callApi('', 'PUT', { address: next });
        if (put.status >= 400) {
          setNotice({
            tone: 'error',
            text:
              put.data?.error === 'invalid_address'
                ? 'Esa dirección no es válida — fijate que sea la de la red Celo (0x…).'
                : `No se pudo guardar la dirección: ${put.data?.error ?? put.status}`,
          });
          return;
        }
      }
      const verify = await callApi('/verify', 'POST');
      if (verify.status === 200) {
        setNotice({ tone: 'success', text: 'Depósito enviado — mirá cuánto llegó a tu Ripio.' });
      } else if (verify.data?.error === 'verification_cooldown') {
        setNotice({
          tone: 'info',
          text: `Ya mandamos un depósito de prueba hace menos de 24 h. Podés pedir otro a partir del ${shortStamp(verify.data?.retry_at)}.`,
        });
      } else if (verify.data?.error === 'ops_float_insufficient') {
        setNotice({
          tone: 'error',
          text: 'No pudimos mandar el depósito de prueba ahora — probá de nuevo en un rato o avisale al equipo.',
        });
      } else if (verify.data?.error === 'currency_unavailable') {
        setNotice({
          tone: 'error',
          text: 'Todavía no podemos verificar cobros en tu moneda.',
        });
      } else {
        setNotice({
          tone: 'error',
          text: `No se pudo enviar el depósito: ${verify.data?.error ?? verify.status}`,
        });
      }
      await onChanged();
      setEditing(false);
    } finally {
      setBusy(null);
    }
  }

  /** POST {amount} — what the Owner sees credited in Ripio. */
  async function handleConfirm() {
    if (!amountOk || busy) return;
    setBusy('confirm');
    setNotice(null);
    try {
      const res = await callApi('/confirm', 'POST', { amount: amount.trim() });
      if (res.status === 200) {
        setNotice({ tone: 'success', text: '¡Listo! Tu dirección de cobro quedó verificada.' });
        setAmount('');
      } else if (res.data?.error === 'amount_mismatch') {
        setNotice({
          tone: 'error',
          text: `Ese no es el monto que llegó — te ${res.data?.attempts_left === 1 ? 'queda 1 intento' : `quedan ${res.data?.attempts_left} intentos`}.`,
        });
      } else if (res.data?.error === 'verification_failed') {
        setNotice({
          tone: 'error',
          text: 'Los 3 intentos fallaron — esta verificación quedó anulada. Podés pedir un depósito nuevo.',
        });
      } else if (res.data?.error === 'verification_expired') {
        setNotice({
          tone: 'error',
          text: 'La verificación venció — pedí un depósito nuevo.',
        });
      } else {
        setNotice({
          tone: 'error',
          text: `No se pudo confirmar: ${res.data?.error ?? res.status}`,
        });
      }
      await onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container placement="center">
          <Modal.Dialog className="bg-paper">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="font-brand text-2xl font-medium text-ink">
                Dirección de cobro en Ripio
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-ink-muted">
                Las reservas de tus alojamientos se liberan a esta cuenta de Ripio. Para
                verificarla, nomai te manda un depósito chico y vos escribís el monto que
                llegó — así sabemos que la dirección es tuya.
              </p>

              {!verified && (
                <ol className="list-decimal space-y-1 rounded-card border border-sand bg-white p-4 pl-9 text-sm text-ink">
                  <li>En Ripio, andá a <strong>Depositar</strong>.</li>
                  <li>
                    Elegí <strong>{wToken}</strong> ({fiat}) y la red <strong>Celo</strong>.
                  </li>
                  <li>Copiá la dirección y pegala acá abajo.</li>
                </ol>
              )}
              {!verified && (
                <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  Tiene que ser la dirección de la red <strong>Celo</strong> — si la plata se
                  manda a otra red, se pierde.
                </p>
              )}

              {pending ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-ink">
                    Te mandamos un monto chico de {wToken} a tu Ripio. Fijate cuánto llegó y
                    escribilo acá{' '}
                    {payout?.verification?.tx_hash ? (
                      <>
                        (
                        <a
                          className="text-terra-deep underline"
                          href={`${explorer}/tx/${payout.verification.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ver el envío
                        </a>
                        )
                      </>
                    ) : null}
                    .
                  </p>
                  <TextField
                    isRequired
                    value={amount}
                    onChange={setAmount}
                    isInvalid={amount.length > 0 && !amountOk}
                  >
                    <Label>Monto recibido ({fiat})</Label>
                    <Input fullWidth placeholder="0,00" inputMode="decimal" />
                    <FieldError>Escribí el monto exacto, por ejemplo 0,37.</FieldError>
                  </TextField>
                  <p className="text-xs text-ink-muted">
                    {payout?.verification?.attempts_left === 1
                      ? 'Te queda 1 intento.'
                      : `Te quedan ${payout?.verification?.attempts_left ?? 3} intentos.`}{' '}
                    El depósito vence el {shortStamp(payout?.verification?.expires_at)}.
                  </p>
                </div>
              ) : showAddressForm ? (
                <TextField
                  isRequired
                  value={address}
                  onChange={setAddress}
                  isInvalid={address.length > 0 && !isValid}
                >
                  <Label>
                    {verified ? 'Nueva dirección' : 'Dirección de depósito Ripio en Celo'} (0x…)
                  </Label>
                  <Input fullWidth placeholder="0x…" />
                  <FieldError>
                    Ingresá una dirección válida de 42 caracteres (0x…).
                  </FieldError>
                </TextField>
              ) : null}

              {!pending && !showAddressForm && !verified && payout?.address ? (
                <div className="flex items-center justify-between rounded-card border border-sand bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      Dirección cargada — falta verificarla
                    </p>
                    <p className="font-mono text-xs text-ink-muted">
                      {trimAddress(payout.address)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      setEditing(true);
                      setAddress('');
                      setNotice(null);
                    }}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : null}

              {status === 'failed' && (
                <p className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
                  La última verificación falló — se escribieron 3 montos que no eran. Pedí un
                  depósito nuevo (uno por día).
                </p>
              )}
              {status === 'expired' && (
                <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  La última verificación venció sin confirmar — pedí un depósito nuevo.
                </p>
              )}

              {verified && payout?.address ? (
                <div className="flex items-center justify-between rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-emerald-900">Dirección verificada</p>
                    <p className="font-mono text-xs text-emerald-900/80">
                      {trimAddress(payout.address)} · {shortStamp(payout.verified_at)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      setEditing(true);
                      setAddress('');
                      setNotice({
                        tone: 'info',
                        text: 'Cambiar la dirección reinicia la verificación: vas a tener que confirmar un depósito nuevo.',
                      });
                    }}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : null}

              {notice ? (
                <p
                  className={`rounded-card px-4 py-3 text-xs ${
                    notice.tone === 'error'
                      ? 'border border-red-200 bg-red-50 text-red-900'
                      : notice.tone === 'success'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border border-sand bg-white text-ink-muted'
                  }`}
                >
                  {notice.text}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              {pending ? (
                <Button fullWidth isPending={busy === 'confirm'} onPress={handleConfirm} isDisabled={!amountOk}>
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      {isPending ? 'Confirmando…' : 'Confirmar monto'}
                    </>
                  )}
                </Button>
              ) : !verified ? (
                <Button
                  fullWidth
                  isPending={busy === 'save'}
                  onPress={handleStart}
                  isDisabled={showAddressForm && !isValid}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      {isPending ? 'Verificando…' : startLabel}
                    </>
                  )}
                </Button>
              ) : editing ? (
                <Button
                  fullWidth
                  isPending={busy === 'save'}
                  onPress={handleStart}
                  isDisabled={!isValid}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      {isPending ? 'Verificando…' : 'Guardar y verificar'}
                    </>
                  )}
                </Button>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/** The Owner's panel with real Supabase data: business → listings → bookings. */
export function OwnerDashboard({ userId, userEmail, userName }: OwnerDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [lodgings, setLodgings] = useState<Lodging[]>([]);
  const [lodgingRules, setLodgingRules] = useState<
    Record<string, { canRelocate: boolean; canRemove: boolean }>
  >({});
  const [bookings, setBookings] = useState<BookingData[]>([]);
  /** The Owner's review feed (ADR-0008): storefront score + received/given. */
  const [reviewFeed, setReviewFeed] = useState<ApiOwnerReviews | null>(null);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  /** The payout state from the api (verification included) — issue #68. */
  const [payout, setPayout] = useState<PayoutState | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [ownerCountryCode, setOwnerCountryCode] = useState('AR');
  /** The open wizard: `{}` creates, `{ lodging }` edits. */
  const [wizard, setWizard] = useState<{ lodging?: Lodging } | null>(null);

  // Payout state — the api's GET /owners/payout (address, verified_at, the
  // in-flight verification). PostgREST can't write payout_address since #68,
  // so everything the modal does goes through /api/owners/payout*.
  const loadPayout = useCallback(async () => {
    try {
      const res = await fetch('/api/owners/payout', { cache: 'no-store' });
      if (res.ok) setPayout((await res.json()) as PayoutState);
    } catch {
      /* the chip keeps showing the business row's stale address */
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // 1. Business + Lodgings come from the server: it resolves the Owner by
      // auth.uid() and stamps each Lodging with its Upcoming Booking rules.
      const res = await fetch('/api/owners/lodgings', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));

      if (res.status === 401 || !res.ok) {
        toast(`Error cargando negocio: ${payload.error ?? res.status}`);
        setLoading(false);
        return;
      }

      const bus = (payload.business ?? null) as BusinessRow | null;
      setBusiness(bus);
      setOwnerCountryCode(payload.countryCode ?? 'AR');

      if (!bus) {
        setLoading(false);
        return;
      }

      const rows = (payload.lodgings ?? []) as OwnerLodgingRow[];
      const rules: Record<string, { canRelocate: boolean; canRemove: boolean }> = {};

      // 2. Map to Lodging UI models (id is the slug, like the marketplace API).
      const mappedLodgings: Lodging[] = rows.map((l) => {
        const currency = (l.currency?.toUpperCase() || 'ARS') as Fiat;
        const photos = [...(l.photos ?? [])].sort((a, b) => a.position - b.position);
        const cover = photos.find((p) => p.is_cover)?.url ?? photos[0]?.url;
        rules[l.slug] = { canRelocate: l.canRelocate, canRemove: l.canRemove };

        return {
          id: l.slug,
          name: l.title,
          kind: apiKind(l.property?.property_type, l.kind),
          city: l.property?.city || '',
          region: l.property?.region || '',
          countryCode: l.property?.country_code || 'AR',
          code: apiCityCode(l.property?.city, l.slug),
          pricePerNight: l.base_price_minor / MINOR_UNIT,
          priceDisplay: formatMoney(l.base_price_minor, currency),
          currency,
          blurb: l.description || l.summary || '',
          rating: l.rating ?? 0,
          reviews: l.reviews ?? 0,
          guests: l.max_guests ?? 1,
          bedrooms: l.bedrooms ?? 0,
          baths: l.bathrooms ?? 0,
          amenities: (l.amenities ?? []).map((a) => a.name),
          ownerSlug: bus.slug,
          ownerName: bus.name,
          tone: apiTone(l.slug),
          photoUrl: cover,
          photos: photos.length ? photos.map((p) => p.url) : undefined,
          address: l.property?.address_line1 ?? undefined,
          lat: l.property?.latitude ?? undefined,
          lng: l.property?.longitude ?? undefined,
          status: l.status,
        };
      });

      setLodgingRules(rules);
      setLodgings(mappedLodgings);

      // 3. Fetch real bookings via RLS (policy bookings_owner_read enforces owns_listing)
      const { data: bookingsData, error: bkgErr } = await supabase
        .from('bookings')
        .select(`
          id,
          listing_id,
          traveler_id,
          guest_ref,
          checkin,
          checkout,
          guests,
          total_minor,
          currency,
          status,
          created_at,
          listing:listings!inner (
            id,
            title,
            slug,
            property:properties!inner (
              id,
              name,
              city
            )
          )
        `)
        .order('checkin', { ascending: false });

      if (bkgErr) {
        toast(`Error cargando reservas: ${bkgErr.message}`);
      } else if (bookingsData) {
        setBookings(bookingsData as unknown as BookingData[]);
      }

      // 4. The review feed goes through the api: Traveler-facing rows aren't
      // readable over RLS, only via the service-role RPCs (ADR-0008).
      fetch('/api/owners/reviews', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ApiOwnerReviews | null) => d && setReviewFeed(d))
        .catch(() => {});

      // 5. Payout state — same reason: payout_verifications isn't readable
      // over RLS at all, only via the api (issue #68).
      loadPayout();
    } finally {
      setLoading(false);
    }
  }, [loadPayout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Action: toggle listing status (published <-> paused) through the service
  // route — `set_lodging_status` re-checks ownership server-side and is the
  // only self-serve transition; `listingSlug` is the Lodging's id on this
  // surface — the public slug, like the marketplace API.
  async function toggleListingStatus(listingSlug: string, newStatus: 'published' | 'paused') {
    const res = await fetch(`/api/owners/lodgings/${encodeURIComponent(listingSlug)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(`Error al actualizar estado: ${data.error ?? res.status}`);
      return;
    }

    setLodgings((prev) =>
      prev.map((l) => (l.id === listingSlug ? { ...l, status: newStatus } : l))
    );
    toast(
      newStatus === 'published'
        ? 'Alojamiento publicado en el catálogo público'
        : 'Alojamiento pausado del catálogo público'
    );
  }

  // Helper action: claim Ramon Guaymas for demo evaluation
  async function claimRamon() {
    setClaiming(true);
    try {
      const res = await fetch('/api/owners/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', slug: 'ramon-guaymas' }),
      });
      const data = await res.json();
      if (res.ok && data.business) {
        toast('¡Perfil de Ramón Guaymás vinculado con éxito!');
        await loadData();
      } else {
        toast(`Error: ${data.error || 'No se pudo reclamar el perfil'}`);
      }
    } catch {
      toast('Error de conexión al reclamar perfil');
    } finally {
      setClaiming(false);
    }
  }

  // Compute summary metrics
  const activeListingsCount = lodgings.filter((l) => l.status === 'published').length;

  // Filter valid bookings (confirmed/completed)
  const validBookings = bookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'completed'
  );

  // Total income in minor units
  const totalIncomeMinor = validBookings.reduce((sum, b) => sum + (b.total_minor || 0), 0);
  const currency = lodgings[0]?.currency || 'ARS';

  // Total occupied nights
  const occupiedNights = validBookings.reduce((sum, b) => {
    const inD = new Date(b.checkin);
    const outD = new Date(b.checkout);
    const nights = Math.max(
      1,
      Math.round((outD.getTime() - inD.getTime()) / (1000 * 60 * 60 * 24))
    );
    return sum + nights;
  }, 0);

  // Next arrival (upcoming confirmed booking)
  const nextArrival = bookings
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => a.checkin.localeCompare(b.checkin))[0];

  // Bookings the Owner already reviewed (ADR-0008: one to_traveler per Booking).
  const givenBookingIds = new Set(
    (reviewFeed?.given ?? []).map((r) => r.booking_id),
  );

  const displayName =
    business?.name?.split(' ')[0] ||
    userName?.split(' ')[0] ||
    userEmail?.split('@')[0] ||
    'Dueño';

  /** The Owner the wizard needs: business row + the Lodgings' country. */
  const wizardOwner: Owner | null = business
    ? {
        slug: business.slug,
        name: business.name,
        initials: initialsFor(business.name),
        city: lodgings[0]?.city ?? '',
        country: RIPIO_COUNTRIES.find((c) => c.code === ownerCountryCode)?.name ?? '',
        countryCode: ownerCountryCode,
      }
    : null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-ink-muted">
        <Spinner size="md" color="current" />
        <p>Cargando panel del dueño…</p>
      </div>
    );
  }

  // Empty state: no business linked yet
  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center rounded-panel border border-sand bg-white p-8 text-center sm:p-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-terra-soft text-2xl text-terra-deep font-brand font-semibold">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <h1 className="brand-display mt-4 text-3xl font-medium text-ink sm:text-4xl">
          Hola, {displayName}
        </h1>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          Aún no tenés ningún alojamiento vinculado a tu cuenta en nomai. Podés registrar tu
          alojamiento o vincular un perfil pre-configurado de evaluación.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/owners/join"
            className="inline-flex h-11 items-center justify-center rounded-full bg-terra px-6 text-sm font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-terra"
          >
            Registrar mi alojamiento
          </Link>
          <Button
            variant="secondary"
            isPending={claiming}
            onPress={claimRamon}
            className="h-11 rounded-full px-6 text-sm"
          >
            {({ isPending }) => (
              <>
                {isPending && <Spinner size="sm" color="current" />}
                {isPending ? 'Vinculando…' : 'Vincular Ramón Guaymás (demo)'}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-terra-deep">
            Panel del dueño · {business.name}
          </p>
          <h1 className="brand-display mt-1 text-4xl font-medium leading-tight text-ink sm:text-5xl">
            Hola, {displayName}
          </h1>
        </div>

        {/* Cobros Ripio — the verified deposit address (#68). */}
        <div className="flex items-center gap-3 rounded-card border border-sand bg-white px-4 py-2.5">
          <div className="text-left">
            <p className="text-xs text-ink-muted">Cobros Ripio</p>
            <p className="font-mono text-xs font-medium text-ink">
              {payout?.address || business.payout_address
                ? trimAddress(payout?.address ?? business.payout_address)
                : 'Sin cargar'}
            </p>
            <p
              className={`text-[11px] font-medium ${
                payout?.verified_at
                  ? 'text-emerald-700'
                  : payout?.verification?.status === 'pending'
                    ? 'text-amber-700'
                    : payout?.verification?.status === 'failed' ||
                        payout?.verification?.status === 'expired'
                      ? 'text-red-700'
                      : 'text-ink-muted'
              }`}
            >
              {payout?.verified_at
                ? 'Verificada'
                : payout?.verification?.status === 'pending'
                  ? 'Pendiente'
                  : payout?.verification?.status === 'failed' ||
                      payout?.verification?.status === 'expired'
                    ? 'Fallida'
                    : payout?.address || business.payout_address
                      ? 'Sin verificar'
                      : ''}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setPayoutModalOpen(true)}
            className="text-xs"
          >
            {payout?.verified_at ? 'Ver' : 'Verificar'}
          </Button>
        </div>
      </header>

      {/* Summary Metrics */}
      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card bg-terra p-6 text-white">
          <p className="text-sm text-white/80">Cobrado en Ripio</p>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
            {formatMoney(totalIncomeMinor, currency)}
          </p>
          <p className="mt-2 text-xs text-white/70">
            neto · liberado por etapas en tu billetera Ripio
          </p>
        </div>

        <div className="rounded-card border border-sand bg-white p-6">
          <p className="text-sm text-ink-muted">Alojamientos y Noches</p>
          <p className="mt-2 font-brand text-3xl font-medium text-ink">
            {activeListingsCount}{' '}
            <span className="text-lg font-normal text-ink-muted">
              {activeListingsCount === 1 ? 'activo' : 'activos'}
            </span>
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {occupiedNights} {occupiedNights === 1 ? 'noche ocupada' : 'noches ocupadas'}
          </p>
        </div>

        {nextArrival ? (
          <div className="rounded-card border border-sand bg-white p-6">
            <p className="text-sm text-ink-muted">Próxima llegada</p>
            <p className="mt-2 font-brand text-xl font-medium text-ink">
              {nextArrival.guest_ref || 'Viajero'} · {formatShortDate(nextArrival.checkin)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {nextArrival.listing?.title} · {nextArrival.guests}{' '}
              {nextArrival.guests === 1 ? 'huésped' : 'huéspedes'}
            </p>
          </div>
        ) : (
          <div className="rounded-card border border-sand bg-white p-6">
            <p className="text-sm text-ink-muted">Próxima llegada</p>
            <p className="mt-2 font-brand text-xl font-medium text-ink">Sin reservas próximas</p>
            <p className="mt-1 text-sm text-ink-muted">
              Tus alojamientos están listos para recibir reservas de Nomito.
            </p>
          </div>
        )}
      </section>

      {/* Bookings Section */}
      <section aria-labelledby="reservas-heading">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="reservas-heading" className="font-brand text-2xl font-medium text-ink">
              Reservas
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              El pago de cada reserva queda en garantía y se libera a tu cuenta de Ripio por etapas.
            </p>
          </div>
          <span className="rounded-full bg-sand/60 px-3 py-1 font-mono text-xs font-medium text-ink">
            {bookings.length} {bookings.length === 1 ? 'reserva' : 'reservas'}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {bookings.length > 0 ? (
            bookings.map((b) => (
              <ReservaCard
                key={b.id}
                booking={b}
                alreadyReviewed={givenBookingIds.has(b.id)}
              />
            ))
          ) : (
            <div className="rounded-card border border-dashed border-sand bg-white/60 p-8 text-center text-ink-muted">
              <p className="font-medium text-ink">Aún no hay reservas registradas</p>
              <p className="mt-1 text-sm">
                Cuando los viajeros reserven con Nomito, aparecerán automáticamente acá.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Reviews Section */}
      {reviewFeed && reviewFeed.received.length > 0 && (
        <OwnerReviewsSection
          feed={reviewFeed}
          onReplied={(id, body) =>
            setReviewFeed((prev) =>
              prev
                ? {
                    ...prev,
                    received: prev.received.map((r) =>
                      r.review_id === id ? { ...r, reply_body: body, replied_at: new Date().toISOString() } : r,
                    ),
                  }
                : prev,
            )
          }
        />
      )}

      {/* Lodgings Section */}
      <section aria-labelledby="alojamientos-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="alojamientos-heading" className="font-brand text-2xl font-medium text-ink">
              Tus alojamientos
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Lo que los viajeros ven en tu escaparate y en el catálogo público de nomai.
            </p>
          </div>
          <Button variant="secondary" size="sm" onPress={() => setWizard({})}>
            + Sumar otro alojamiento
          </Button>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {lodgings.length > 0 ? (
            lodgings.map((l) => (
              <AlojamientoCard
                key={l.id}
                lodging={l}
                onEdit={() => setWizard({ lodging: l })}
                onToggleStatus={(status) => toggleListingStatus(l.id, status)}
              />
            ))
          ) : (
            <div className="col-span-2 rounded-card border border-dashed border-sand bg-white/60 p-8 text-center text-ink-muted">
              <p className="font-medium text-ink">No tenés alojamientos cargados</p>
              <p className="mt-1 text-sm">
                Comenzá publicando tu primer alojamiento con el asistente.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onPress={() => setWizard({})}
              >
                Cargar alojamiento
              </Button>
            </div>
          )}
        </div>
      </section>

      {wizard && wizardOwner && (
        <LodgingWizard
          key={wizard.lodging?.id ?? 'new'}
          owner={wizardOwner}
          lodging={wizard.lodging}
          rules={wizard.lodging ? lodgingRules[wizard.lodging.id] : undefined}
          isOpen
          onOpenChange={(open) => !open && setWizard(null)}
          onSaved={loadData}
        />
      )}

      {/* Cobros Ripio — the deposit-address verification (#68). */}
      {business && payoutModalOpen && (
        <PayoutModal
          isOpen={payoutModalOpen}
          onOpenChange={setPayoutModalOpen}
          payout={payout}
          currency={lodgings[0]?.currency ?? 'ARS'}
          onChanged={async () => {
            await loadPayout();
          }}
        />
      )}
    </div>
  );
}
