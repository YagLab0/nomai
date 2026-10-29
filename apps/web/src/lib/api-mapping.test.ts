import { describe, expect, it } from 'vitest';

import type { ApiListingCard, ApiListingDetail } from '@/lib/api';
import { apiCardToLodging, apiDetailToLodging } from './api-mapping';

const card = (over: Partial<ApiListingCard> = {}): ApiListingCard => ({
  slug: 'cabanas-siete-colores',
  title: 'Cabañas Siete Colores',
  kind: 'entire_place',
  property_type: 'cabana',
  city: 'Purmamarca',
  country_code: 'AR',
  currency: 'USD',
  nightly_minor: 70_000_000,
  nightly_display: 'US$ 70.00',
  max_guests: 4,
  min_nights: 1,
  amenities: [],
  rating: 4.8,
  reviews: 12,
  owner_name: 'Lidia Condori',
  owner_slug: 'lidia-condori',
  owner_rating: null,
  owner_reviews: 0,
  ...over,
});

const detail = (over: Partial<ApiListingDetail> = {}): ApiListingDetail => ({
  slug: 'cabanas-siete-colores',
  title: 'Cabañas Siete Colores',
  kind: 'entire_place',
  currency: 'USD',
  base_price_minor: 70_000_000,
  base_price_display: 'US$ 70.00',
  cleaning_fee_minor: 0,
  cleaning_fee_display: 'US$ 0.00',
  min_nights: 1,
  max_nights: null,
  max_guests: 4,
  instant_book: true,
  pets_allowed: false,
  smoking_allowed: false,
  events_allowed: false,
  property: { name: 'Cabañas Siete Colores', property_type: 'cabana', city: 'Purmamarca', country_code: 'AR' },
  business: { name: 'Lidia Condori', slug: 'lidia-condori' },
  amenities: [],
  photos: [],
  ...over,
});

describe('apiCardToLodging photos', () => {
  it('passes the API cover_photo through as photoUrl, untouched', () => {
    const url =
      'https://tspsaemylnzvdgwtjcrz.supabase.co/storage/v1/object/public/listing-photos/bus_1/lst_1/0-abc.jpg';
    const lodging = apiCardToLodging(card({ cover_photo: url }));
    expect(lodging.photoUrl).toBe(url);
    expect(lodging.photo).toBeUndefined();
  });

  it('leaves photoUrl undefined when the API sends no cover — LodgingArt takes over', () => {
    const lodging = apiCardToLodging(card());
    expect(lodging.photoUrl).toBeUndefined();
    expect(lodging.photo).toBeUndefined();
  });
});

describe('apiDetailToLodging photos', () => {
  const photos = [
    { url: 'http://localhost:3000/images/purmamarca-adobe.webp', is_cover: false },
    { url: 'http://localhost:3000/images/purmamarca-siete-colores.webp', is_cover: true },
    { url: 'http://localhost:3000/images/purmamarca-feria.webp', is_cover: false },
  ];

  it('uses the is_cover photo as photoUrl and keeps the ordered gallery', () => {
    const lodging = apiDetailToLodging(detail({ photos }));
    expect(lodging.photoUrl).toBe(photos[1].url);
    expect(lodging.photos).toEqual(photos.map((p) => p.url));
  });

  it('falls back to the first photo when none is flagged as cover', () => {
    const uncovered = photos.map((p) => ({ ...p, is_cover: false }));
    const lodging = apiDetailToLodging(detail({ photos: uncovered }));
    expect(lodging.photoUrl).toBe(uncovered[0].url);
  });

  it('maps an empty gallery to undefined photo fields', () => {
    const lodging = apiDetailToLodging(detail());
    expect(lodging.photoUrl).toBeUndefined();
    expect(lodging.photos).toBeUndefined();
    expect(lodging.photo).toBeUndefined();
  });
});
