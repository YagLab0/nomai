'use client';

import { useState } from 'react';
import { Button, Spinner, TextArea, TextField, toast } from '@heroui/react';

import { Stars } from '@/components/reviews/stars';
import type { ApiOwnerReviews, ApiReview } from '@/lib/api';
import { initialsFor } from '@/lib/api-mapping';
import { formatShortDate } from '@/lib/format';

/**
 * The Owner's review feed (ADR-0008): what guests wrote about the business's
 * Lodgings, with the public reply control Booking-style hosts have. Replies
 * POST /api/owners/reviews/[id]/reply — the api re-checks ownership.
 */
export function OwnerReviewsSection({
  feed,
  onReplied,
}: {
  feed: ApiOwnerReviews;
  onReplied: (reviewId: string, body: string) => void;
}) {
  return (
    <section aria-labelledby="resenas-heading">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="resenas-heading" className="font-brand text-2xl font-medium text-ink">
            Reseñas de tus huéspedes
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Lo que los viajeros escribieron después de hospedarse en tus alojamientos.
          </p>
        </div>
        {feed.score.rating != null && (
          <span className="inline-flex items-center gap-2 rounded-full bg-sand/60 px-3 py-1 text-ink">
            <Stars rating={feed.score.rating} size="md" />
            <span className="font-mono text-xs font-medium">
              {feed.score.rating.toFixed(1)} · {feed.score.reviews}
            </span>
          </span>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-4">
        {feed.received.map((r) => (
          <ReceivedReview key={r.review_id} review={r} onReplied={onReplied} />
        ))}
      </ul>
    </section>
  );
}

function ReceivedReview({
  review,
  onReplied,
}: {
  review: ApiReview;
  onReplied: (reviewId: string, body: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(review.reply_body ?? '');
  const [saving, setSaving] = useState(false);

  async function saveReply() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/owners/reviews/${encodeURIComponent(review.review_id)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'No pudimos guardar la respuesta.');
      }
      onReplied(review.review_id, draft.trim());
      setReplying(false);
      toast('Respuesta publicada');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No pudimos guardar la respuesta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-card border border-sand bg-white p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terra-soft text-xs font-medium text-terra-deep"
        >
          {initialsFor(review.author_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{review.author_name}</p>
          <p className="truncate text-xs text-ink-muted">
            {review.listing_title ?? 'Alojamiento'}
            {review.stayed_checkout ? ` · estadía hasta ${formatShortDate(review.stayed_checkout)}` : ''}
          </p>
        </div>
        <Stars rating={review.rating} />
      </div>

      {review.body && <p className="mt-3 text-sm leading-relaxed text-ink">{review.body}</p>}

      {review.reply_body && !replying ? (
        <div className="mt-3 rounded-xl bg-sand/40 px-3.5 py-2.5">
          <p className="text-xs font-medium text-ink-muted">
            Tu respuesta
            {review.replied_at ? ` · ${formatShortDate(review.replied_at)}` : ''}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{review.reply_body}</p>
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="mt-1.5 text-xs font-medium text-terra-deep underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
          >
            Editar respuesta
          </button>
        </div>
      ) : replying ? (
        <div className="mt-3 flex flex-col gap-2.5">
          <TextField value={draft} onChange={setDraft}>
            <TextArea
              fullWidth
              rows={3}
              placeholder="Tu respuesta es pública — agradecé, aclará o sumá contexto…"
              aria-label="Respuesta pública"
            />
          </TextField>
          <div className="flex gap-2">
            <Button size="sm" isPending={saving} onPress={saveReply}>
              {({ isPending }) => (
                <>
                  {isPending && <Spinner color="current" size="sm" />}
                  {isPending ? 'Publicando…' : 'Publicar respuesta'}
                </>
              )}
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setReplying(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setReplying(true)}
          className="mt-2.5 text-xs font-medium text-terra-deep underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
        >
          Responder públicamente
        </button>
      )}
    </li>
  );
}
