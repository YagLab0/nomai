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
import type { Pin } from '@/components/owners/pin-picker-map';
import { catalog, CatalogFullError } from '@/lib/catalog';
import {
  FIAT_META,
  KIND_LABEL,
  LODGING_KINDS,
  ownerFiat,
  townByName,
  townsInCountry,
  type LodgingKind,
  type Owner,
} from '@/lib/lodgings';

const PinPickerMap = dynamic(() => import('@/components/owners/pin-picker-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-sand/60" />,
});

/**
 * "Agregar alojamiento": the four-step alta wizard (owner-views §9). Siguiente
 * validates only the current step, Atrás keeps what was typed, and Publicar
 * writes to the catalog — the Lodging is born published.
 */

const STEP_LABELS = ['Básico', 'Ubicación', 'Detalles', 'Fotos y precio'] as const;

interface Draft {
  name: string;
  kind: LodgingKind;
  town: string;
  address: string;
  /** Starts at the town center when a town is chosen; the Owner moves it. */
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
    <div>
      <p id={labelId} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-terra">
            {' '}
            *
          </span>
        )}
      </p>
      <div role="group" aria-labelledby={labelId} className="mt-2 flex items-center gap-3">
        <button
          type="button"
          aria-label={`${label}: uno menos`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
        >
          <MinusIcon className="h-4 w-4" />
        </button>
        <output aria-live="polite" className="min-w-[7rem] text-center text-ink">
          {format(value)}
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

export function LodgingWizard({
  owner,
  isOpen,
  onOpenChange,
}: {
  owner: Owner;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const fiat = ownerFiat(owner);
  const towns = townsInCountry(owner.countryCode);
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
  const town = towns.find((t) => t.name === draft.town);
  const townInvalid = !town;
  const addressInvalid = !draft.address.trim();
  const parsedPrice = Number(draft.price.replace(/\./g, '').replace(',', '.'));
  const priceInvalid = !Number.isFinite(parsedPrice) || parsedPrice <= 0;
  const invalid = [nameInvalid, townInvalid || addressInvalid || !draft.pin, false, priceInvalid][step];

  function chooseTown(name: string) {
    const t = townByName(name);
    setDraft({ ...draft, town: name, pin: t ? { lat: t.lat, lng: t.lng } : null });
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

  function publish() {
    setTouched(true);
    if (priceInvalid || !draft.pin) return;
    try {
      catalog.create(owner.slug, {
        name: draft.name,
        kind: draft.kind,
        town: draft.town,
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
      });
    } catch (e) {
      setError(
        e instanceof CatalogFullError
          ? 'No hay más espacio en este navegador para guardar las fotos. Quitá alguna o elegí otras y probá de nuevo: lo demás queda como lo dejaste.'
          : 'No se pudo publicar. Revisá los datos y probá de nuevo.',
      );
      return;
    }
    toast('Alojamiento publicado');
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
                Agregar alojamiento
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

                    <div className="grid gap-5 sm:grid-cols-3">
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

                {step === 1 && (
                  <div className="mt-5 flex flex-col gap-5">
                    <Select
                      isRequired
                      placeholder="Elegí el pueblo"
                      selectedKey={draft.town || null}
                      onSelectionChange={(k) => chooseTown(k ? String(k) : '')}
                      isInvalid={touched && townInvalid}
                    >
                      <Label>Pueblo o ciudad</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {towns.map((t) => (
                            <ListBox.Item key={t.name} id={t.name} textValue={t.name}>
                              {t.name}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                      <FieldError>Elegí el pueblo donde está.</FieldError>
                    </Select>

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

                    <div>
                      <p className="text-sm font-medium text-ink">
                        Pin en el mapa
                        <span aria-hidden="true" className="text-terra">
                          {' '}
                          *
                        </span>
                      </p>
                      {town && draft.pin ? (
                        <>
                          <p className="mt-1 text-xs text-ink-muted">
                            Arrastrá el pin hasta la puerta. Con teclado: enfocá el pin y movelo con las flechas.
                          </p>
                          <div className="mt-2 h-56 overflow-hidden rounded-card border border-sand sm:h-64">
                            <PinPickerMap
                              center={town}
                              pin={draft.pin}
                              onChange={(pin) => setDraft((d) => ({ ...d, pin }))}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                            <p className="flex items-center gap-1.5">
                              <MapPinIcon className="h-3.5 w-3.5 text-terra" />
                              <output aria-live="polite" data-testid="pin-coords" className="font-mono">
                                {draft.pin.lat.toFixed(4)}, {draft.pin.lng.toFixed(4)}
                              </output>
                            </p>
                            <Button
                              variant="tertiary"
                              size="sm"
                              onPress={() => setDraft({ ...draft, pin: { lat: town.lat, lng: town.lng } })}
                            >
                              Volver al centro del pueblo
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-2 flex h-24 items-center justify-center rounded-card border border-dashed border-sand text-center text-sm text-ink-muted">
                          Elegí el pueblo y el mapa se centra ahí.
                        </div>
                      )}
                    </div>
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
                <Button className="flex-1" onPress={publish} isDisabled={preparingPhotos}>
                  Publicar
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
