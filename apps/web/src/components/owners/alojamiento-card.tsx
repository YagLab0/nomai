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

function EditModal({
  lodging,
  isOpen,
  onOpenChange,
  onSave,
}: {
  lodging: Lodging;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: AlojamientoDraft) => void;
}) {
  const [name, setName] = useState(lodging.name);
  const [price, setPrice] = useState(String(lodging.pricePerNight));
  const [blurb, setBlurb] = useState(lodging.blurb);
  const [amenities, setAmenities] = useState(lodging.amenities.join('\n'));
  const [touched, setTouched] = useState(false);

  const parsedPrice = Number(price.replace(/\./g, '').replace(',', '.'));
  const nameInvalid = name.trim().length < 3;
  const priceInvalid = !Number.isFinite(parsedPrice) || parsedPrice <= 0;

  function save() {
    setTouched(true);
    if (nameInvalid || priceInvalid) return;
    onSave({
      name: name.trim(),
      pricePerNight: Math.round(parsedPrice),
      blurb: blurb.trim(),
      amenities: amenities
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean),
    });
    onOpenChange(false);
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
              <Button fullWidth onPress={save}>
                Guardar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/** A Lodging the Owner manages, with the edit modal. Mock saves via onSave. */
export function AlojamientoCard({
  lodging,
  onSave,
}: {
  lodging: Lodging;
  onSave: (draft: AlojamientoDraft) => void;
}) {
  const [editing, setEditing] = useState(false);
  const photo = lodgingCover(lodging);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card bg-white">
      <div className="relative h-40 overflow-hidden">
        {photo ? (
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
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="font-mono text-xs tracking-widest text-ink-muted">
          {lodging.code} · {lodging.city}
        </p>
        <h3 className="mt-0.5 font-brand text-xl font-medium leading-snug text-ink">
          {lodging.name}
        </h3>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          {KIND_LABEL[lodging.kind]}
          {lodging.reviews === 0 ? (
            <span className="rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">
              Nuevo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-ink">
              <StarIcon className="h-3.5 w-3.5 text-terra" />
              {lodging.rating.toFixed(1)}
            </span>
          )}
        </p>
        <p className="mt-2 text-sm leading-snug text-ink">{lodging.blurb}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Servicios">
          {lodging.amenities.map((a) => (
            <li key={a} className="rounded-full bg-sand/50 px-2.5 py-0.5 text-xs text-ink">
              {a}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="font-mono text-base font-semibold text-ink">
            {formatLocalPrice(lodging)}
            <span className="font-sans text-sm font-normal text-ink-muted">
              {' '}
              {lodging.currency} / noche
            </span>
          </p>
          <div className="flex items-center gap-4">
            <Link
              href={`/lodgings/${lodging.id}`}
              className="text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
            >
              Ver en el catálogo
            </Link>
            <Button variant="secondary" size="sm" onPress={() => setEditing(true)}>
              Editar
            </Button>
          </div>
        </div>
      </div>

      {editing && (
        <EditModal lodging={lodging} isOpen={editing} onOpenChange={setEditing} onSave={onSave} />
      )}
    </article>
  );
}
