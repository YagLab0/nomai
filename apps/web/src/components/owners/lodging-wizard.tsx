'use client';

import dynamic from 'next/dynamic';
import { useEffect, useId, useRef, useState } from 'react';
import {
  Button,
  FieldError,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextArea,
  TextField,
  toast,
} from '@heroui/react';

import { CheckIcon, MapPinIcon, MinusIcon, PlusIcon } from '@/components/icons';
import { PhotoPicker } from '@/components/owners/photo-picker';
import { PlaceSearch } from '@/components/owners/place-search';
import type { Pin } from '@/components/owners/pin-picker-map';
import { catalog, CatalogFullError, type LodgingDraft } from '@/lib/catalog';
import { type Place } from '@/lib/geocode';
import {
  FIAT_META,
  KIND_LABEL,
  LODGING_KINDS,
  ownerFiat,
  type Lodging,
  type LodgingKind,
  type Owner,
} from '@/lib/lodgings';

const mapLoading = () => <div className="h-full w-full bg-sand/60" />;
const PinPickerMap = dynamic(() => import('@/components/owners/pin-picker-map'), { ssr: false, loading: mapLoading });
const LodgingMap = dynamic(() => import('@/components/marketplace/lodging-map'), { ssr: false, loading: mapLoading });

/**
 * "Agregar alojamiento" and "Editar": one four-step wizard (owner-views §9).
 * Siguiente validates only the current step, Atrás keeps what was typed, and
 * Publicar writes to the catalog — the Lodging is born published. In edit mode
 * it saves changes, locks the location and can delete, both per the
 * Upcoming Booking rule.
 */

const STEP_LABELS = ['Básico', 'Ubicación', 'Detalles', 'Fotos y precio'] as const;

interface Draft {
  name: string;
  kind: LodgingKind;
  /** Display name of the picked place — what the search field shows. */
  town: string;
  /** The geocoded pick: unlocks the map and carries name/region/country. */
  place: LodgingDraft['place'] | null;
  address: string;
  /** Where the Owner marked it on the map — the exact spot, not the town. */
  pin: Pin | null;
  guests: number;
  bedrooms: number;
  baths: number;
  blurb: string;
  /** Servicios, one per line. */
  amenities: string;
  /** Compressed data URLs; the first is the cover. */
  photos: string[];
  price: string;
}

const EMPTY: Draft = {
  name: '',
  kind: 'posada',
  town: '',
  place: null,
  address: '',
  pin: null,
  guests: 2,
  bedrooms: 1,
  baths: 1,
  blurb: '',
  amenities: '',
  photos: [],
  price: '',
};

function StepChips({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Pasos">
      {STEP_LABELS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'next';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-medium ${
              state === 'current'
                ? 'bg-terra text-white'
                : state === 'done'
                  ? 'bg-agua-soft text-agua'
                  : 'bg-sand/60 text-ink-muted'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                state === 'current'
                  ? 'bg-white text-terra-deep'
                  : state === 'done'
                    ? 'bg-agua text-white'
                    : 'bg-paper text-ink-muted'
              }`}
            >
              {state === 'done' ? <CheckIcon className="h-3 w-3" /> : i + 1}
            </span>
            {label}
            {state === 'done' && <span className="sr-only">(listo)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function CountField({
  label,
  required,
  value,
  min,
  max,
  onChange,
  format,
}: {
  label: string;
  required?: boolean;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
}) {
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p id={labelId} className="whitespace-nowrap text-sm font-medium text-ink">
          {label}
          {required && (
            <span aria-hidden="true" className="text-terra">
              {' '}
              *
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">{format(value)}</p>
      </div>
      <div role="group" aria-labelledby={labelId} className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={`${label}: uno menos`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
        >
          <MinusIcon className="h-4 w-4" />
        </button>
        <output aria-live="polite" className="min-w-8 text-center text-sm font-medium text-ink">
          {value}
        </output>
        <button
          type="button"
          aria-label={`${label}: uno más`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function prefill(l: Lodging): Draft {
  return {
    name: l.name,
    kind: l.kind,
    town: l.city,
    place: { name: l.city, region: l.region, countryCode: l.countryCode, lat: l.lat, lng: l.lng },
    address: l.address ?? '',
    pin: l.lat !== undefined && l.lng !== undefined ? { lat: l.lat, lng: l.lng } : null,
    guests: l.guests,
    bedrooms: l.bedrooms,
    baths: l.baths,
    blurb: l.blurb,
    amenities: l.amenities.join('\n'),
    photos: l.photos ?? [],
    price: String(l.pricePerNight),
  };
}

export function LodgingWizard({
  owner,
  lodging,
  isOpen,
  onOpenChange,
}: {
  owner: Owner;
  /** Edit mode: the Lodging to prefill. Without it the wizard creates one. */
  lodging?: Lodging;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => (lodging ? prefill(lodging) : EMPTY));
  const [error, setError] = useState<string | null>(null);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const locationLocked = !!lodging && !catalog.canRelocate(lodging.id);
  const removable = !!lodging && catalog.canRemove(lodging.id);
  const panel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const fiat = ownerFiat(owner);
  const last = STEP_LABELS.length - 1;

  const hints = [
    'Nombre, tipo y cuánta gente entra.',
    `Tu cuenta de Ripio es de ${owner.country}, así que el alojamiento tiene que estar ahí.`,
    'Lo que el viajero lee antes de pedirle a Nomito.',
    `Lo primero que ve el viajero. El precio va en ${FIAT_META[fiat].name.toLowerCase()} y lo cobrás directo, sin comisión.`,
  ];

  // Each step swaps the panel's content: move focus there so it's announced.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panel.current?.focus();
  }, [step]);

  const nameInvalid = draft.name.trim().length < 3;
  const addressInvalid = !draft.address.trim();
  const parsedPrice = Number(draft.price.replace(/\./g, '').replace(',', '.'));
  const priceInvalid = !Number.isFinite(parsedPrice) || parsedPrice <= 0;
  const invalid = [nameInvalid, !draft.place || addressInvalid || !draft.pin, false, priceInvalid][step];

  /** Picking a place flies the map there and waits for a fresh pin on it. */
  function pickPlace(place: Place) {
    setDraft((d) => ({ ...d, town: place.name, place, pin: null }));
  }

  /** Click, drag or arrows on the map: the pin is the exact spot, the town stays the searched place. */
  function pickPin(pin: Pin) {
    setDraft((d) => ({ ...d, pin }));
  }

  function next() {
    setTouched(true);
    if (invalid) return;
    setTouched(false);
    setStep(step + 1);
  }

  function back() {
    setTouched(false);
    setError(null);
    setStep(step - 1);
  }

  function save() {
    setTouched(true);
    if (priceInvalid || !draft.pin) return;
    const fields: LodgingDraft = {
      name: draft.name,
      kind: draft.kind,
      place: draft.place!,
      address: draft.address,
      lat: draft.pin.lat,
      lng: draft.pin.lng,
      guests: draft.guests,
      bedrooms: draft.bedrooms,
      baths: draft.baths,
      pricePerNight: parsedPrice,
      blurb: draft.blurb,
      amenities: draft.amenities
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean),
      photos: draft.photos,
    };
    try {
      if (lodging) catalog.update(lodging.id, fields);
      else catalog.create(owner.slug, fields);
    } catch (e) {
      setError(
        e instanceof CatalogFullError
          ? 'No hay más espacio en este navegador para guardar las fotos. Quitá alguna o elegí otras y probá de nuevo: lo demás queda como lo dejaste.'
          : 'No se pudo guardar. Revisá los datos y probá de nuevo.',
      );
      return;
    }
    toast(lodging ? 'Alojamiento actualizado' : 'Alojamiento publicado');
    onOpenChange(false);
  }

  function remove() {
    if (!lodging) return;
    try {
      catalog.remove(lodging.id);
    } catch {
      setError('No se pudo eliminar. Probá de nuevo.');
      return;
    }
    toast('Alojamiento eliminado');
    onOpenChange(false);
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container placement="center">
          <Modal.Dialog className="bg-paper sm:max-w-xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="font-brand text-2xl font-medium text-ink">
                {lodging ? `Editar ${lodging.name}` : 'Agregar alojamiento'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-6">
              <StepChips current={step} />
              <div ref={panel} tabIndex={-1} className="outline-none">
                <h3 className="font-brand text-xl font-medium text-ink">{STEP_LABELS[step]}</h3>
                <p className="mt-1 text-sm text-ink-muted">{hints[step]}</p>

                {step === 0 && (
                  <div className="mt-5 flex flex-col gap-5">
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

                    <div className="flex flex-col gap-4">
                      <CountField
                        label="Capacidad"
                        required
                        value={draft.guests}
                        min={1}
                        max={30}
                        onChange={(guests) => setDraft({ ...draft, guests })}
                        format={(n) => `hasta ${n} ${n === 1 ? 'persona' : 'personas'}`}
                      />
                      <CountField
                        label="Dormitorios"
                        value={draft.bedrooms}
                        min={0}
                        max={20}
                        onChange={(bedrooms) => setDraft({ ...draft, bedrooms })}
                        format={(n) => `${n} ${n === 1 ? 'dormitorio' : 'dormitorios'}`}
                      />
                      <CountField
                        label="Baños"
                        value={draft.baths}
                        min={1}
                        max={10}
                        onChange={(baths) => setDraft({ ...draft, baths })}
                        format={(n) => `${n} ${n === 1 ? 'baño' : 'baños'}`}
                      />
                    </div>
                  </div>
                )}

                {step === 1 && locationLocked && lodging && (
                  <div className="mt-5 flex flex-col gap-4">
                    <p role="note" className="rounded-card bg-terra-soft/70 px-4 py-3 text-sm text-terra-deep">
                      Tenés reservas confirmadas en este alojamiento: la ubicación no se puede cambiar.
                    </p>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-ink-muted">Pueblo o ciudad</dt>
                        <dd className="mt-0.5 font-medium text-ink">{lodging.city}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Dirección</dt>
                        <dd className="mt-0.5 font-medium text-ink">{lodging.address ?? '—'}</dd>
                      </div>
                    </dl>
                    {lodging.lat !== undefined && lodging.lng !== undefined && (
                      <div className="h-56 overflow-hidden rounded-card border border-sand sm:h-64">
                        <LodgingMap lodging={lodging} />
                      </div>
                    )}
                  </div>
                )}

                {step === 1 && !locationLocked && (
                  <div className="mt-5 flex flex-col gap-5">
                    <div>
                      <PlaceSearch
                        countryCode={owner.countryCode}
                        initialValue={draft.town}
                        onPick={pickPlace}
                        onClear={() => setDraft((d) => ({ ...d, place: null }))}
                      />
                      {touched && !draft.place && (
                        <p className="mt-1.5 text-xs font-medium text-terra">
                          Buscá y elegí el lugar donde está.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium text-ink">
                        Pin en el mapa
                        <span aria-hidden="true" className="text-terra">
                          {' '}
                          *
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {draft.place
                          ? 'Tocá el mapa para marcar dónde está y arrastrá el pin hasta la puerta.'
                          : 'El mapa se desbloquea cuando elegís el lugar.'}
                      </p>
                      <div className="mt-2 h-56 overflow-hidden rounded-card border border-sand sm:h-64">
                        <PinPickerMap
                          pin={draft.pin}
                          focus={
                            draft.place?.lat != null && draft.place?.lng != null
                              ? { lat: draft.place.lat, lng: draft.place.lng }
                              : null
                          }
                          interactive={!!draft.place}
                          onPick={pickPin}
                          onChange={pickPin}
                        />
                      </div>
                      {draft.place && draft.pin && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                          <p className="flex items-center gap-1.5">
                            <MapPinIcon className="h-3.5 w-3.5 text-terra" />
                            <span data-testid="pin-town" className="font-medium text-ink">
                              {draft.town}
                            </span>
                            <output aria-live="polite" data-testid="pin-coords" className="font-mono">
                              {draft.pin.lat.toFixed(4)}, {draft.pin.lng.toFixed(4)}
                            </output>
                          </p>
                          {typeof draft.place.lat === 'number' && typeof draft.place.lng === 'number' && (
                            <Button
                              variant="tertiary"
                              size="sm"
                              onPress={() => pickPin({ lat: draft.place!.lat!, lng: draft.place!.lng! })}
                            >
                              Volver al centro del lugar
                            </Button>
                          )}
                        </div>
                      )}
                      {touched && draft.place && !draft.pin && (
                        <p className="mt-2 text-xs font-medium text-terra">
                          Tocá el mapa para marcar el alojamiento.
                        </p>
                      )}
                    </div>

                    {draft.place && (
                      <TextField
                        isRequired
                        value={draft.address}
                        onChange={(address) => setDraft({ ...draft, address })}
                        isInvalid={touched && addressInvalid}
                      >
                        <Label>Dirección</Label>
                        <Input fullWidth placeholder="Nuestra Señora del Rosario 165" />
                        <FieldError>Escribí la dirección, con calle y número.</FieldError>
                      </TextField>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="mt-5 flex flex-col gap-5">
                    <TextField
                      value={draft.blurb}
                      onChange={(blurb) => setDraft({ ...draft, blurb })}
                    >
                      <Label>Descripción corta</Label>
                      <TextArea fullWidth rows={2} placeholder="Patio con parral, a dos cuadras de la plaza." />
                    </TextField>
                    <TextField
                      value={draft.amenities}
                      onChange={(amenities) => setDraft({ ...draft, amenities })}
                    >
                      <Label>Servicios (uno por línea)</Label>
                      <TextArea fullWidth rows={4} placeholder={'Desayuno\nWifi\nParrilla'} />
                    </TextField>
                  </div>
                )}

                {step === 3 && (
                  <div className="mt-5 flex flex-col gap-6">
                    <PhotoPicker
                      photos={draft.photos}
                      onChange={(update) => setDraft((d) => ({ ...d, photos: update(d.photos) }))}
                      busy={preparingPhotos}
                      onBusyChange={setPreparingPhotos}
                    />
                    <TextField
                      isRequired
                      value={draft.price}
                      onChange={(price) => setDraft({ ...draft, price })}
                      isInvalid={touched && priceInvalid}
                    >
                      <Label>Precio por noche ({fiat})</Label>
                      <Input fullWidth inputMode="numeric" placeholder="95.000" />
                      <FieldError>Poné un precio mayor a cero.</FieldError>
                    </TextField>
                  </div>
                )}

                {error && (
                  <p role="alert" className="mt-4 text-sm font-medium text-terra-deep">
                    {error}
                  </p>
                )}
              </div>

              {lodging && (
                <section aria-label="Eliminar alojamiento" className="border-t border-sand pt-5">
                  {!removable ? (
                    <>
                      <Button variant="danger-soft" size="sm" isDisabled aria-describedby="remove-reason">
                        Eliminar alojamiento
                      </Button>
                      <p id="remove-reason" className="mt-2 text-xs text-ink-muted">
                        Tenés reservas confirmadas o en curso en este alojamiento: no se puede eliminar.
                      </p>
                    </>
                  ) : confirmingRemove ? (
                    <div className="rounded-card border border-terra/40 bg-white p-4">
                      <p className="text-sm text-ink">
                        ¿Eliminar {lodging.name}? Deja de aparecer en tu escaparate, en el catálogo y en Nomito. No se
                        puede deshacer.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="danger" size="sm" onPress={remove}>
                          Sí, eliminar
                        </Button>
                        <Button variant="secondary" size="sm" onPress={() => setConfirmingRemove(false)}>
                          No, conservarlo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="danger-soft" size="sm" onPress={() => setConfirmingRemove(true)}>
                      Eliminar alojamiento
                    </Button>
                  )}
                </section>
              )}
            </Modal.Body>
            <Modal.Footer className="flex gap-3">
              {step === 0 ? (
                <Button variant="secondary" className="flex-1" onPress={() => onOpenChange(false)}>
                  Cancelar
                </Button>
              ) : (
                <Button variant="secondary" className="flex-1" onPress={back}>
                  Atrás
                </Button>
              )}
              {step < last ? (
                <Button className="flex-1" onPress={next}>
                  Siguiente
                </Button>
              ) : (
                <Button className="flex-1" onPress={save} isDisabled={preparingPhotos}>
                  {lodging ? 'Guardar cambios' : 'Publicar'}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
