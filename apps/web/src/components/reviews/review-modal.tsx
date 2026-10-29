'use client';

import { useState } from 'react';
import { Button, FieldError, Label, Modal, Spinner, TextArea, TextField } from '@heroui/react';

import { StarInput } from '@/components/reviews/stars';

export interface ReviewPayload {
  rating: number;
  body: string;
  categories?: Record<string, number>;
}

export interface ReviewCategory {
  code: string;
  label: string;
}

/** Traveler → Lodging subscores (ADR-0008, Airbnb's six). */
export const LODGING_CATEGORIES: ReviewCategory[] = [
  { code: 'cleanliness', label: 'Limpieza' },
  { code: 'accuracy', label: 'Veracidad del anuncio' },
  { code: 'checkin', label: 'Check-in' },
  { code: 'communication', label: 'Comunicación' },
  { code: 'location', label: 'Ubicación' },
  { code: 'value', label: 'Precio' },
];

/** Owner → Traveler subscores (ADR-0008, Airbnb's guest categories). */
export const TRAVELER_CATEGORIES: ReviewCategory[] = [
  { code: 'cleanliness', label: 'Limpieza' },
  { code: 'communication', label: 'Comunicación' },
  { code: 'house_rules', label: 'Respetó las reglas de la casa' },
];

/**
 * The review form both sides of a Booking share (ADR-0008): overall 1–5
 * stars, optional subscores and an optional public comment. `onSubmit` throws
 * with a user-facing message when the api rejects (window closed, already
 * reviewed, …).
 */
export function ReviewModal({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  categories,
  bodyPlaceholder = 'Contale a otros viajeros cómo fue tu estadía…',
  submitLabel = 'Publicar reseña',
  onSubmit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  categories?: ReviewCategory[];
  bodyPlaceholder?: string;
  submitLabel?: string;
  onSubmit: (payload: ReviewPayload) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>({});
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setTouched(true);
    if (!rating || saving) return;
    setSaving(true);
    setError(null);
    try {
      const filled = Object.fromEntries(
        Object.entries(categoryRatings).filter(([, v]) => v > 0),
      );
      await onSubmit({
        rating,
        body: body.trim(),
        ...(Object.keys(filled).length ? { categories: filled } : {}),
      });
      onOpenChange(false);
      setRating(0);
      setCategoryRatings({});
      setBody('');
      setTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos publicar tu reseña.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog className="bg-paper">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="font-brand text-2xl font-medium text-ink">
                {title}
              </Modal.Heading>
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-5">
              <TextField isRequired isInvalid={touched && !rating}>
                <Label>Tu calificación</Label>
                <StarInput value={rating} onChange={setRating} />
                <FieldError>Elegí entre 1 y 5 estrellas.</FieldError>
              </TextField>

              {categories?.length ? (
                <fieldset className="flex flex-col gap-2.5">
                  <legend className="text-sm text-ink-muted">
                    Puntuá por categoría <span className="text-xs">(opcional)</span>
                  </legend>
                  {categories.map((cat) => (
                    <div key={cat.code} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink">{cat.label}</span>
                      <StarInput
                        size="md"
                        aria-label={cat.label}
                        value={categoryRatings[cat.code] ?? 0}
                        onChange={(v) =>
                          setCategoryRatings((prev) => ({ ...prev, [cat.code]: v }))
                        }
                      />
                    </div>
                  ))}
                </fieldset>
              ) : null}

              <TextField value={body} onChange={setBody}>
                <Label>Tu comentario <span className="text-xs text-ink-muted">(público)</span></Label>
                <TextArea fullWidth rows={4} placeholder={bodyPlaceholder} />
              </TextField>

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button fullWidth isPending={saving} onPress={handleSubmit}>
                {({ isPending }) => (
                  <>
                    {isPending && <Spinner color="current" size="sm" />}
                    {isPending ? 'Publicando…' : submitLabel}
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
