'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, SearchField, Tag, TagGroup, type Key } from '@heroui/react';

import { SearchIcon } from '@/components/icons';
import { CurrencySelect } from '@/components/marketplace/currency-select';
import { LodgingCard } from '@/components/marketplace/lodging-card';
import { apiCardToLodging } from '@/lib/api-mapping';
import type { ApiListingCard } from '@/lib/api';
import { KIND_LABEL, LODGING_KINDS, type Fiat, type Lodging } from '@/lib/lodgings';
import { useFxRates } from '@/lib/use-fx-rates';
import { useLodgingOverlay } from '@/lib/use-lodgings';
import { askHrefInApp } from '@/lib/nomito/ask';

function matches(lodging: Lodging, query: string): boolean {
  if (!query) return true;
  const haystack = [
    lodging.name,
    lodging.city,
    lodging.region,
    KIND_LABEL[lodging.kind],
    lodging.ownerName ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Lodging explorer: search, kind filters, currency picker and the results grid.
 * `mode` decides where "Pedirle a Nomito" goes: sign-up on the public site, the
 * chat inside the app.
 */
export function LodgingExplorer({ mode }: { mode: 'public' | 'app' }) {
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<Iterable<Key>>(new Set());
  /** Traveler's preferred currency. undefined = each lodging's local currency. */
  const [fiat, setFiat] = useState<Fiat | undefined>(undefined);
  const selected = useMemo(() => new Set(kinds), [kinds]);

  const { rates, source: fxSource } = useFxRates();

  /**
   * Inventory comes from the listings API through the same-origin proxy.
   * `lodgings === null` is still loading; `error` means the fetch failed —
   * the grid swaps for a state either way, the rest of the page still works.
   */
  const [apiLodgings, setApiLodgings] = useState<Lodging[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setApiLodgings(null);
    setError(false);
    fetch('/api/listings')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`listings: ${r.status}`))))
      .then((body: { results?: ApiListingCard[] }) => {
        if (alive) setApiLodgings((body?.results ?? []).map(apiCardToLodging));
      })
      .catch(() => {
        if (alive) {
          setApiLodgings([]);
          setError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Lodgings created, edited or deleted in this browser merge over the API list.
  const lodgings = useLodgingOverlay(apiLodgings);
  const results = useMemo(
    () => (lodgings ?? []).filter((l) => (selected.size === 0 || selected.has(l.kind)) && matches(l, query)),
    [lodgings, selected, query],
  );

  const clearFilters = () => {
    setQuery('');
    setKinds(new Set());
  };

  return (
    <div>
      <form className="max-w-2xl" role="search" onSubmit={(e) => e.preventDefault()}>
        <SearchField aria-label="Destino" name="destino" value={query} onChange={setQuery} fullWidth>
          <SearchField.Group>
            <SearchIcon className="ml-3 h-4 w-4 text-ink-muted" />
            <SearchField.Input placeholder="¿A dónde vas? Salta, Florianópolis, Cartagena…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </form>

      <TagGroup
        aria-label="Tipo de alojamiento"
        selectionMode="multiple"
        selectedKeys={kinds}
        onSelectionChange={setKinds}
        className="mt-5"
      >
        <TagGroup.List className="flex flex-wrap gap-2">
          {LODGING_KINDS.map((kind) => (
            <Tag key={kind.id} id={kind.id} className="cursor-pointer">
              {kind.label}
            </Tag>
          ))}
        </TagGroup.List>
      </TagGroup>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-ink-muted" aria-live="polite">
          {lodgings === null
            ? 'Buscando alojamientos…'
            : `${results.length} ${results.length === 1 ? 'alojamiento' : 'alojamientos'} · el pago va directo al dueño`}
          {fiat && (
            <span className="block text-xs">
              ≈ estimado al cambio {fxSource === 'static' || !fxSource ? '· cotización de referencia' : '· cotización en vivo'}
              {' '}— Nomito congela el tipo de cambio al pagar
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {(query || selected.size > 0) && (
            <Button variant="tertiary" size="sm" onPress={clearFilters}>
              Limpiar filtros
            </Button>
          )}
          <CurrencySelect value={fiat} onChange={setFiat} />
        </div>
      </div>

      {lodgings === null ? (
        <ul aria-busy="true" aria-label="Cargando alojamientos" className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-72 animate-pulse rounded-card bg-sand/50" />
          ))}
        </ul>
      ) : error ? (
        <EmptyState className="mt-16 flex flex-col items-center gap-3 text-center">
          <SearchIcon className="h-8 w-8 text-ink-muted" />
          <p className="font-brand text-xl text-ink">No pudimos cargar los alojamientos</p>
          <p className="max-w-sm text-sm text-ink-muted">
            El catálogo no responde ahora mismo. Reintentá en un momento, o contale a Nomito qué buscás.
          </p>
          <Button variant="secondary" onPress={() => setReloadKey((k) => k + 1)}>
            Reintentar
          </Button>
        </EmptyState>
      ) : results.length > 0 ? (
        <ul className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((lodging) => (
            <li key={lodging.id}>
              <LodgingCard
                lodging={lodging}
                fiat={fiat}
                rates={rates}
                askHref={mode === 'app' ? askHrefInApp(lodging) : '/signup'}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="mt-16 flex flex-col items-center gap-3 text-center">
          <SearchIcon className="h-8 w-8 text-ink-muted" />
          <p className="font-brand text-xl text-ink">Nada por acá todavía</p>
          <p className="max-w-sm text-sm text-ink-muted">
            No hay alojamientos que coincidan. Probá otro destino o limpiá los filtros, o contale a Nomito qué buscás.
          </p>
          <Button variant="secondary" onPress={clearFilters}>
            Limpiar filtros
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
