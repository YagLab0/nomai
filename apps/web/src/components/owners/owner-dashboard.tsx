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

import { AlojamientoCard, type AlojamientoDraft } from '@/components/owners/alojamiento-card';
import { ReservaCard, type BookingData } from '@/components/owners/reserva-card';
import { formatMoney, formatShortDate } from '@/lib/format';
import { apiCityCode, apiKind, apiTone, FALLBACK_PHOTOS_BY_SLUG } from '@/lib/api-mapping';
import type { Fiat, Lodging } from '@/lib/lodgings';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type BusinessRow = Database['public']['Tables']['businesses']['Row'];

interface OwnerDashboardProps {
  userId: string;
  userEmail?: string;
  userName?: string;
}

const MINOR_UNIT = 1_000_000;

function PayoutModal({
  isOpen,
  onOpenChange,
  currentAddress,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentAddress: string;
  onSave: (newAddress: string) => Promise<void>;
}) {
  const [address, setAddress] = useState(currentAddress);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const isValid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());

  async function handleSave() {
    setTouched(true);
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await onSave(address.trim());
      onOpenChange(false);
    } finally {
      setSaving(false);
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
                Dirección de cobro Ripio
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <p className="text-sm text-ink-muted">
                Las reservas de tus alojamientos se transfieren directamente a esta dirección en
                la red Celo. nomai nunca custodia tus fondos.
              </p>
              <TextField
                isRequired
                value={address}
                onChange={setAddress}
                isInvalid={touched && !isValid}
              >
                <Label>Dirección EVM / Ripio (0x...)</Label>
                <Input fullWidth placeholder="0x..." />
                <FieldError>Ingresá una dirección válida de 42 caracteres (0x...).</FieldError>
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button fullWidth isPending={saving} onPress={handleSave}>
                {({ isPending }) => (
                  <>
                    {isPending && <Spinner color="current" size="sm" />}
                    {isPending ? 'Guardando…' : 'Guardar dirección'}
                  </>
                )}
              </Button>
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
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // 1. Fetch business owned by current user
      const { data: bus, error: busErr } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (busErr) {
        toast(`Error cargando negocio: ${busErr.message}`);
        setLoading(false);
        return;
      }

      setBusiness(bus);

      if (!bus) {
        setLoading(false);
        return;
      }

      // 2. Fetch listings owned by this business via properties join
      const { data: listingsData, error: listErr } = await supabase
        .from('listings')
        .select(`
          id,
          slug,
          title,
          status,
          base_price_minor,
          currency,
          kind,
          max_guests,
          bedrooms,
          bathrooms,
          summary,
          description,
          rating,
          reviews,
          property:properties!inner (
            id,
            name,
            city,
            region,
            country_code,
            property_type,
            business_id
          )
        `)
        .eq('property.business_id', bus.id);

      if (listErr) {
        toast(`Error cargando alojamientos: ${listErr.message}`);
      } else if (listingsData) {
        // Map to Lodging UI models
        const mappedLodgings: Lodging[] = listingsData.map((l) => {
          const prop = Array.isArray(l.property) ? l.property[0] : l.property;
          const currency = (l.currency?.toUpperCase() || 'ARS') as Fiat;
          const priceDisplay = formatMoney(l.base_price_minor, currency);
          const photo = FALLBACK_PHOTOS_BY_SLUG[l.slug];

          return {
            id: l.id,
            name: l.title,
            kind: apiKind(prop?.property_type, l.kind),
            city: prop?.city || '',
            region: prop?.region || '',
            countryCode: prop?.country_code || 'AR',
            code: apiCityCode(prop?.city, l.slug),
            pricePerNight: l.base_price_minor / MINOR_UNIT,
            priceDisplay,
            currency,
            blurb: l.description || l.summary || '',
            rating: l.rating ?? 0,
            reviews: l.reviews ?? 0,
            guests: l.max_guests ?? 1,
            bedrooms: l.bedrooms ?? 0,
            baths: l.bathrooms ?? 0,
            amenities: [],
            ownerSlug: bus.slug,
            ownerName: bus.name,
            tone: apiTone(l.slug),
            photo,
            status: l.status,
          };
        });

        setLodgings(mappedLodgings);
      }

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
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Action: toggle listing status (published <-> paused)
  async function toggleListingStatus(listingId: string, newStatus: 'published' | 'paused') {
    const supabase = createClient();
    const { error } = await supabase
      .from('listings')
      .update({ status: newStatus })
      .eq('id', listingId);

    if (error) {
      toast(`Error al actualizar estado: ${error.message}`);
      return;
    }

    setLodgings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, status: newStatus } : l))
    );
    toast(
      newStatus === 'published'
        ? 'Alojamiento publicado en el catálogo público'
        : 'Alojamiento pausado del catálogo público'
    );
  }

  // Action: save editable lodging fields
  async function saveAlojamiento(listingId: string, draft: AlojamientoDraft) {
    const minor = draft.pricePerNight * MINOR_UNIT;
    const supabase = createClient();
    const { error } = await supabase
      .from('listings')
      .update({
        title: draft.name,
        base_price_minor: minor,
        description: draft.blurb,
      })
      .eq('id', listingId);

    if (error) {
      toast(`Error al guardar: ${error.message}`);
      return;
    }

    setLodgings((prev) =>
      prev.map((l) =>
        l.id === listingId
          ? {
              ...l,
              name: draft.name,
              pricePerNight: draft.pricePerNight,
              priceDisplay: formatMoney(minor, l.currency),
              blurb: draft.blurb,
              amenities: draft.amenities,
            }
          : l
      )
    );
    toast('Alojamiento actualizado con éxito');
  }

  // Action: update payout address
  async function savePayoutAddress(newAddress: string) {
    if (!business) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('businesses')
      .update({ payout_address: newAddress })
      .eq('id', business.id);

    if (error) {
      toast(`Error al actualizar cobros: ${error.message}`);
      return;
    }

    setBusiness({ ...business, payout_address: newAddress });
    toast('Dirección de cobro Ripio actualizada');
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

  const displayName =
    business?.name?.split(' ')[0] ||
    userName?.split(' ')[0] ||
    userEmail?.split('@')[0] ||
    'Dueño';

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

        {/* Sensitive data: Payout address */}
        <div className="flex items-center gap-3 rounded-card border border-sand bg-white px-4 py-2.5">
          <div className="text-left">
            <p className="text-xs text-ink-muted">Cobros Ripio</p>
            <p className="font-mono text-xs font-medium text-ink">
              {business.payout_address
                ? `${business.payout_address.slice(0, 6)}…${business.payout_address.slice(-4)}`
                : 'Sin dirección'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setPayoutModalOpen(true)}
            className="text-xs"
          >
            Modificar
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
            neto · al instante en tu billetera Ripio
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
              Cada reserva confirmada se cobra al instante en tu cuenta de Ripio.
            </p>
          </div>
          <span className="rounded-full bg-sand/60 px-3 py-1 font-mono text-xs font-medium text-ink">
            {bookings.length} {bookings.length === 1 ? 'reserva' : 'reservas'}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {bookings.length > 0 ? (
            bookings.map((b) => <ReservaCard key={b.id} booking={b} />)
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
          <Link
            href="/owners/join"
            className="inline-flex h-9 items-center justify-center rounded-full border border-sand bg-white px-4 text-xs font-medium text-ink transition-colors hover:border-terra hover:text-terra-deep focus-visible:outline-2 focus-visible:outline-terra"
          >
            + Sumar otro alojamiento
          </Link>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {lodgings.length > 0 ? (
            lodgings.map((l) => (
              <AlojamientoCard
                key={l.id}
                lodging={l}
                onSave={(d) => saveAlojamiento(l.id, d)}
                onToggleStatus={(status) => toggleListingStatus(l.id, status)}
              />
            ))
          ) : (
            <div className="col-span-2 rounded-card border border-dashed border-sand bg-white/60 p-8 text-center text-ink-muted">
              <p className="font-medium text-ink">No tenés alojamientos cargados</p>
              <p className="mt-1 text-sm">
                Comenzá publicando tu primer alojamiento con el asistente.
              </p>
              <Link
                href="/owners/join"
                className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-terra px-5 text-xs font-medium text-white transition-colors hover:bg-terra-deep"
              >
                Cargar alojamiento
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Sensitive Data: Payout Address Modal */}
      {business && (
        <PayoutModal
          isOpen={payoutModalOpen}
          onOpenChange={setPayoutModalOpen}
          currentAddress={business.payout_address || ''}
          onSave={savePayoutAddress}
        />
      )}
    </div>
  );
}
