'use client';

import { useEffect, useState } from 'react';

import { Stars } from '@/components/reviews/stars';
import { LODGING_CATEGORIES } from '@/components/reviews/review-modal';
import type { ApiListingReviews, ApiReview } from '@/lib/api';
import { initialsFor } from '@/lib/api-mapping';
import { formatShortDate } from '@/lib/format';

const CATEGORY_LABEL = Object.fromEntries(LODGING_CATEGORIES.map((c) => [c.code, c.label]));

/**
 * The public Reviews of a Lodging (ADR-0008): recency-weighted score,
 * category averages and the review thread with the Owner's replies. Reads
 * /api/listings/[slug]/reviews — only Traveler→Lodging Reviews are public.
 */
export function ReviewsSection({ slug }: { slug: string }) {
  const [data, setData] = useState<ApiListingReviews | null | 'loading' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    fetch(`/api/listings/${encodeURIComponent(slug)}/reviews`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ApiListingReviews) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData('error');
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (data === 'loading') {
    return (
      <section aria-busy="true" aria-label="Cargando reseñas" className="mt-10">
        <div className="h-6 w-40 animate-pulse rounded bg-sand/60 motion-reduce:animate-none" />
        <div className="mt-4 h-24 animate-pulse rounded-card bg-sand/40 motion-reduce:animate-none" />
      </section>
    );
  }
  if (data === 'error' || data === null || data.reviews === 0) return null;

  const categoryEntries = Object.entries(data.categories ?? {}).filter(
    ([, v]) => typeof v === 'number',
  );

  return (
    <section aria-labelledby="reviews-heading" className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="reviews-heading" className="font-brand text-xl font-medium text-ink">
          Reseñas
        </h2>
        {data.rating != null && (
          <span className="inline-flex items-center gap-2 text-ink">
            <Stars rating={data.rating} size="md" />
            <span className="font-mono font-medium">{data.rating.toFixed(1)}</span>
            <span className="text-sm text-ink-muted">
              · {data.reviews} {data.reviews === 1 ? 'reseña' : 'reseñas'}
            </span>
          </span>
        )}
      </div>

      {categoryEntries.length > 0 && (
        <dl className="mt-4 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
          {categoryEntries.map(([code, avg]) => (
            <div key={code} className="flex items-center justify-between gap-2">
              <dt className="text-sm text-ink-muted">{CATEGORY_LABEL[code] ?? code}</dt>
              <dd className="font-mono text-sm font-medium text-ink">{avg.toFixed(1)}</dd>
            </div>
          ))}
        </dl>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {data.items.map((r) => (
          <ReviewCard key={r.review_id} review={r} />
        ))}
      </ul>
    </section>
  );
}

function ReviewCard({ review }: { review: ApiReview }) {
  return (
    <li className="flex flex-col gap-3 rounded-card border border-sand bg-white p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-terra-soft text-xs font-medium text-terra-deep"
        >
          {initialsFor(review.author_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{review.author_name}</p>
          <p className="text-xs text-ink-muted">
            {review.stayed_checkout
              ? `se hospedó hasta ${formatShortDate(review.stayed_checkout)}`
              : formatShortDate(review.created_at)}
          </p>
        </div>
        <Stars rating={review.rating} />
      </div>

      {review.body && <p className="text-sm leading-relaxed text-ink">{review.body}</p>}

      {review.reply_body && (
        <div className="rounded-xl bg-sand/40 px-3.5 py-2.5">
          <p className="text-xs font-medium text-ink-muted">
            Respuesta del anfitrión
            {review.replied_at ? ` · ${formatShortDate(review.replied_at)}` : ''}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{review.reply_body}</p>
        </div>
      )}
    </li>
  );
}
