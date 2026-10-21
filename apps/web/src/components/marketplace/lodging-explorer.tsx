"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import {
  Button,
  EmptyState,
  ListBox,
  SearchField,
  Select,
  Separator,
  Tag,
  TagGroup,
  type Key,
} from "@heroui/react";
import {
  BedDouble,
  Building2,
  CalendarDays,
  Home,
  Hotel,
  MessageCircle,
  Search,
  Sparkles,
  Trees,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  FALLBACK_USD_RATES,
  FIAT_OPTIONS,
  KIND_LABEL,
  LODGING_KINDS,
  LODGINGS,
  ownerBySlug,
  type Fiat,
  type FxRates,
  type Lodging,
  type LodgingKind,
} from "@/lib/lodgings";
import { LodgingCard } from "./lodging-card";

const KIND_ICON: Record<LodgingKind, LucideIcon> = {
  posada: BedDouble,
  cabana: Trees,
  departamento: Building2,
  casa: Home,
  hostal: Hotel,
  "hotel-boutique": Sparkles,
};

function matches(lodging: Lodging, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    lodging.name,
    lodging.city,
    lodging.region,
    KIND_LABEL[lodging.kind],
    ownerBySlug(lodging.ownerSlug)?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Marketplace explorer: an M3 segmented search bar (destination / dates /
 * guests), a Material-You filter-tag row for lodging kinds, and the
 * Airbnb-style results grid.
 */
export function LodgingExplorer() {
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Iterable<Key>>(new Set());
  /** Traveler's preferred currency. undefined = each lodging's local fiat. */
  const [fiat, setFiat] = useState<Fiat | undefined>(undefined);

  const selected = useMemo(() => new Set(kinds), [kinds]);

  /** Live fiat-per-USD rates; /api/fx resolves Ripio → public FX → static. */
  const [rates, setRates] = useState<FxRates>(FALLBACK_USD_RATES);
  const [fxSource, setFxSource] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.rates) {
          setRates(body.rates);
          setFxSource(body.source ?? null);
        }
      })
      .catch(() => {});
  }, []);
  const results = useMemo(
    () =>
      LODGINGS.filter(
        (l) =>
          (selected.size === 0 || selected.has(l.kind)) && matches(l, query),
      ),
    [selected, query],
  );

  const clearFilters = () => {
    setQuery("");
    setKinds(new Set());
  };

  return (
    <div className="font-readex">
      {/* M3 segmented search bar */}
      <form
        className="mx-auto max-w-2xl"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1 rounded-full border border-separator bg-surface p-1.5 pl-5 shadow-lg shadow-terra/10">
          <SearchField
            aria-label="Destino"
            name="destino"
            variant="secondary"
            value={query}
            onChange={setQuery}
            className="min-w-0 flex-1"
          >
            <SearchField.Group className="border-0 bg-transparent px-0 shadow-none">
              <SearchField.Input
                className="w-full text-sm"
                placeholder="¿A dónde vas?"
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>

          <Separator
            orientation="vertical"
            className="hidden h-7 sm:block"
          />
          <button
            type="button"
            className="hidden shrink-0 items-center gap-2 rounded-full px-4 py-2 text-left transition-colors hover:bg-surface-secondary sm:flex"
          >
            <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
            <span>
              <span className="block text-[11px] font-medium">Fechas</span>
              <span className="block text-xs text-muted">Flexibles</span>
            </span>
          </button>

          <Separator
            orientation="vertical"
            className="hidden h-7 md:block"
          />
          <button
            type="button"
            className="hidden shrink-0 items-center gap-2 rounded-full px-4 py-2 text-left transition-colors hover:bg-surface-secondary md:flex"
          >
            <Users className="h-4 w-4 text-muted" aria-hidden />
            <span>
              <span className="block text-[11px] font-medium">Huéspedes</span>
              <span className="block text-xs text-muted">¿Cuántos?</span>
            </span>
          </button>

          <Button isIconOnly aria-label="Buscar" className="shrink-0 rounded-full">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {/* M3 filter tags by lodging kind */}
      <TagGroup
        aria-label="Tipo de alojamiento"
        selectionMode="multiple"
        selectedKeys={kinds}
        onSelectionChange={setKinds}
        className="mt-6"
      >
        <TagGroup.List className="flex flex-wrap justify-center gap-2">
          {LODGING_KINDS.map((kind) => {
            const Icon = KIND_ICON[kind.id];
            return (
              <Tag
                key={kind.id}
                id={kind.id}
                className="cursor-pointer gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {kind.label}
              </Tag>
            );
          })}
        </TagGroup.List>
      </TagGroup>

      {/* Result count + preferred-currency picker */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {results.length}{" "}
          {results.length === 1 ? "alojamiento" : "alojamientos"} · el pago va
          directo a la wallet del dueño
          {fiat && (
            <span className="block text-xs">
              ≈ estimado al cambio{" "}
              {fxSource === "ripio"
                ? "· cotización Ripio en vivo"
                : fxSource === "public-fx"
                  ? "· cotización en vivo"
                  : "· cotización de referencia"}{" "}
              — el agente congela el tipo de cambio al pagar
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {(query || selected.size > 0) && (
            <Button
              variant="tertiary"
              size="sm"
              onPress={clearFilters}
              className="shrink-0"
            >
              Limpiar filtros
            </Button>
          )}
          <Select
            aria-label="Ver precios en"
            variant="secondary"
            selectedKey={fiat ?? "local"}
            onSelectionChange={(key) =>
              setFiat(key === "local" ? undefined : (key as Fiat))
            }
            className="w-[150px]"
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="local" textValue="Moneda local">
                  Moneda local
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {FIAT_OPTIONS.map((f) => (
                  <ListBox.Item key={f.id} id={f.id} textValue={f.label}>
                    {f.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      </div>

      {/* Airbnb-style grid */}
      {results.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((lodging) => (
            <LodgingCard
              key={lodging.id}
              lodging={lodging}
              fiat={fiat}
              rates={rates}
            />
          ))}
        </div>
      ) : (
        <EmptyState className="mt-16 flex flex-col items-center gap-3 text-center">
          <Search className="h-8 w-8 text-muted" aria-hidden />
          <p className="font-medium">Nada por acá todavía</p>
          <p className="max-w-sm text-sm text-muted">
            No hay alojamientos que coincidan con tu búsqueda. Probá otro destino
            o limpiá los filtros.
          </p>
          <Button variant="secondary" onPress={clearFilters}>
            Limpiar filtros
          </Button>
        </EmptyState>
      )}

      {/* Extended FAB — talk to the Agent */}
      <NextLink
        href="/"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-medium text-accent-foreground shadow-xl shadow-terra/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        Hablar con tu agente
      </NextLink>
    </div>
  );
}
