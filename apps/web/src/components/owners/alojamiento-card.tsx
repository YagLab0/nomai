'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  Spinner,
  TextArea,
  TextField,
} from '@heroui/react';

import { StarIcon } from '@/components/icons';
import { LodgingArt } from '@/components/marketplace/lodging-art';
import { formatLocalPrice, KIND_LABEL, lodgingCover, type Lodging } from '@/lib/lodgings';

/** Editable Lodging fields (owner-views §3): name, blurb, amenities, price. */
export interface AlojamientoDraft {
  name: string;
  pricePerNight: number;
  blurb: string;
  amenities: string[];
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  published: { label: 'Publicado', className: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
  paused: { label: 'Pausado', className: 'bg-amber-100 text-amber-800 border border-amber-300' },
  draft: { label: 'Borrador', className: 'bg-stone-100 text-stone-700 border border-stone-300' },
  archived: { label: 'Archivado', className: 'bg-stone-100 text-stone-500 border border-stone-300' },
};

function EditModal({
  lodging,
  isOpen,
  onOpenChange,
  onSave,
}: {
  lodging: Lodging;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: AlojamientoDraft) => Promise<void> | void;
}) {
  const [name, setName] = useState(lodging.name);
  const [price, setPrice] = useState(String(lodging.pricePerNight));
  const [blurb, setBlurb] = useState(lodging.blurb);
  const [amenities, setAmenities] = useState(lodging.amenities.join('\n'));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedPrice = Number(price.replace(/\./g, '').replace(',', '.'));
  const nameInvalid = name.trim().length < 3;
  const priceInvalid = !Number.isFinite(parsedPrice) || parsedPrice <= 0;

  async function save() {
    setTouched(true);
    if (nameInvalid || priceInvalid || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        pricePerNight: Math.round(parsedPrice),
        blurb: blurb.trim(),
        amenities: amenities
          .split('\n')
          .map((a) => a.trim())
          .filter(Boolean),
      });
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
                Editar {lodging.name}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-5">
              <TextField
                isRequired
                value={name}
                onChange={setName}
                isInvalid={touched && nameInvalid}
              >
                <Label>Nombre</Label>
                <Input fullWidth />
                <FieldError>Escribí el nombre, como lo conocen tus huéspedes.</FieldError>
              </TextField>

              <TextField
                isRequired
                value={price}
                onChange={setPrice}
                isInvalid={touched && priceInvalid}
              >
                <Label>Precio por noche ({lodging.currency})</Label>
                <Input fullWidth inputMode="numeric" />
                <FieldError>Poné un precio mayor a cero.</FieldError>
              </TextField>

              <TextField value={blurb} onChange={setBlurb}>
                <Label>Descripción corta</Label>
                <TextArea fullWidth rows={2} />
              </TextField>

              <TextField value={amenities} onChange={setAmenities}>
                <Label>Servicios (uno por línea)</Label>
                <TextArea fullWidth rows={4} />
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button fullWidth isPending={saving} onPress={save}>
                {({ isPending }) => (
                  <>
                    {isPending && <Spinner color="current" size="sm" />}
                    {isPending ? 'Guardando…' : 'Guardar'}
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

/** A Lodging the Owner manages, with live status toggle and edit modal. */
export function AlojamientoCard({
  lodging,
  onEdit,
  onSave,
  onToggleStatus,
}: {
  lodging: Lodging;
  /** Opens the four-step wizard instead of the inline EditModal (owner-views §9). */
  onEdit?: () => void;
  onSave?: (draft: AlojamientoDraft) => Promise<void> | void;
  onToggleStatus?: (status: 'published' | 'paused') => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const photo = lodgingCover(lodging);
  const status = lodging.status || 'published';
  const badge = STATUS_BADGE[status] || STATUS_BADGE.published;
  const isPublished = status === 'published';

  async function handleToggle() {
    if (!onToggleStatus || toggling) return;
    setToggling(true);
    try {
      await onToggleStatus(isPublished ? 'paused' : 'published');
    } finally {
      setToggling(false);
    }
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card bg-white border border-sand">
      <div className="relative h-44 overflow-hidden">
        {lodging.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lodging.photoUrl}
            alt={lodging.name}
            className="h-full w-full object-cover"
          />
        ) : photo ? (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
            unoptimized={photo.src.startsWith('data:')}
          />
        ) : (
          <LodgingArt lodging={lodging} className="h-full w-full" />
        )}

        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm ${badge.className}`}>
            {badge.label}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs tracking-widest text-ink-muted">
            {lodging.code ? `${lodging.code} · ` : ''}
            {lodging.city}
          </p>
        </div>

        <h3 className="mt-1 font-brand text-xl font-medium leading-snug text-ink">
          {lodging.name}
        </h3>

        <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          {KIND_LABEL[lodging.kind] || 'Alojamiento'}
          {lodging.rating > 0 ? (
            <span className="inline-flex items-center gap-1 text-ink">
              <StarIcon className="h-3.5 w-3.5 text-terra" />
              {lodging.rating.toFixed(1)}
              {lodging.reviews > 0 && (
                <span className="text-xs text-ink-muted">({lodging.reviews})</span>
              )}
            </span>
          ) : (
            <span className="rounded-full bg-terra-soft px-2 py-0.5 text-xs font-medium text-terra-deep">
              Nuevo
            </span>
          )}
        </p>

        <p className="mt-2 text-sm leading-snug text-ink line-clamp-2">
          {lodging.blurb || 'Sin descripción ingresada aún.'}
        </p>

        {lodging.amenities.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Servicios">
            {lodging.amenities.slice(0, 4).map((a) => (
              <li key={a} className="rounded-full bg-sand/50 px-2.5 py-0.5 text-xs text-ink">
                {a}
              </li>
            ))}
            {lodging.amenities.length > 4 && (
              <li className="rounded-full bg-sand/30 px-2 py-0.5 text-xs text-ink-muted">
                +{lodging.amenities.length - 4} más
              </li>
            )}
          </ul>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5 border-t border-sand/50">
          <p className="font-mono text-base font-semibold text-ink">
            {lodging.priceDisplay || formatLocalPrice(lodging)}
            <span className="font-sans text-sm font-normal text-ink-muted">
              {' '}
              {lodging.currency} / noche
            </span>
          </p>

          <div className="flex items-center gap-2">
            {onToggleStatus && (
              <Button
                variant={isPublished ? 'secondary' : 'primary'}
                size="sm"
                isPending={toggling}
                onPress={handleToggle}
              >
                {({ isPending }) => (
                  <>
                    {isPending && <Spinner color="current" size="sm" />}
                    {isPublished ? 'Pausar' : 'Publicar'}
                  </>
                )}
              </Button>
            )}

            <Button variant="secondary" size="sm" onPress={onEdit ?? (() => setEditing(true))}>
              Editar
            </Button>

            <Link
              href={`/lodgings/${lodging.id}`}
              className="text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
            >
              Ver en el catálogo
            </Link>

            {isPublished && lodging.ownerSlug && (
              <Link
                href={`/owners/${lodging.ownerSlug}`}
                className="text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
              >
                Escaparate
              </Link>
            )}
          </div>
        </div>
      </div>

      {editing && onSave && (
        <EditModal lodging={lodging} isOpen={editing} onOpenChange={setEditing} onSave={onSave} />
      )}
    </article>
  );
}
