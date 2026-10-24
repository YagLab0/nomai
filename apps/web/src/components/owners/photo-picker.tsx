'use client';

import Image from 'next/image';
import { useState } from 'react';

import { PlusIcon, XIcon } from '@/components/icons';
import { MAX_PHOTOS } from '@/lib/catalog';
import { compressImage } from '@/lib/compress-image';

/**
 * The wizard's photos: up to MAX_PHOTOS, picked locally and compressed to
 * JPEG data URLs (owner-views §9, Photos). The first one is the cover.
 */
export function PhotoPicker({
  photos,
  onChange,
  busy,
  onBusyChange,
}: {
  photos: string[];
  onChange: (update: (photos: string[]) => string[]) => void;
  /** True while picked photos are still being compressed. */
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const setBusy = onBusyChange;
  const full = photos.length >= MAX_PHOTOS;

  async function add(input: HTMLInputElement) {
    const picked = [...(input.files ?? [])].filter((f) => f.type.startsWith('image/'));
    input.value = '';
    if (picked.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    setBusy(true);
    try {
      const compressed = await Promise.all(picked.slice(0, room).map((f) => compressImage(f)));
      onChange((current) => [...current, ...compressed].slice(0, MAX_PHOTOS));
      setNote(picked.length > room ? `Hasta ${MAX_PHOTOS} fotos: dejamos las primeras.` : null);
    } catch {
      setNote('No pudimos leer alguna de las fotos. Probá con otra.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">Fotos</p>
        <p className="text-xs text-ink-muted">
          {photos.length} de {MAX_PHOTOS}
        </p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Opcionales. La primera es la portada; sin fotos mostramos una ilustración.
      </p>

      {photos.length > 0 && (
        <ul aria-label="Fotos elegidas" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((src, i) => (
            <li key={`${i}-${src.slice(-24)}`} className="relative aspect-square overflow-hidden rounded-xl bg-sand">
              <Image src={src} alt={`Foto ${i + 1}`} fill unoptimized className="object-cover" />
              {i === 0 && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-paper/95 px-2 py-0.5 text-[11px] font-medium text-terra-deep">
                  Portada
                </span>
              )}
              <button
                type="button"
                aria-label={`Quitar foto ${i + 1}`}
                onClick={() => {
                  setNote(null);
                  onChange((current) => current.filter((_, j) => j !== i));
                }}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-ink focus-visible:outline-2 focus-visible:outline-terra"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        className={`mt-3 inline-flex items-center gap-2 rounded-full border border-dashed px-4 py-2 text-sm font-medium transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-terra ${
          full || busy
            ? 'cursor-not-allowed border-sand text-ink-muted'
            : 'cursor-pointer border-terra/50 text-terra-deep hover:border-terra hover:bg-terra-soft/50'
        }`}
      >
        <PlusIcon className="h-4 w-4" />
        {busy ? 'Preparando fotos…' : 'Agregar fotos'}
        <input
          type="file"
          accept="image/*"
          multiple
          aria-label="Agregar fotos"
          disabled={full || busy}
          onChange={(e) => add(e.currentTarget)}
          className="sr-only"
        />
      </label>

      <p aria-live="polite" className="mt-2 min-h-4 text-xs text-ink-muted">
        {note}
      </p>
    </div>
  );
}
