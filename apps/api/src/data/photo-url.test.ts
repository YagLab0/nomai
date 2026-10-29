import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolvePhotoUrl } from "./photo-url.js";
import { LISTING_PHOTOS } from "./inventory.js";
import { getListingBySlug, searchListings } from "./repo.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolvePhotoUrl", () => {
  it("absolutizes root-relative paths against PUBLIC_WEB_URL", () => {
    vi.stubEnv("PUBLIC_WEB_URL", "https://nomai.travel");
    expect(resolvePhotoUrl("/images/purmamarca-adobe.webp")).toBe(
      "https://nomai.travel/images/purmamarca-adobe.webp"
    );
  });

  it("defaults to the local web app", () => {
    vi.stubEnv("PUBLIC_WEB_URL", "");
    delete process.env.PUBLIC_WEB_URL;
    expect(resolvePhotoUrl("/images/x.webp")).toBe(
      "http://localhost:3000/images/x.webp"
    );
  });

  it("strips a trailing slash from the base", () => {
    vi.stubEnv("PUBLIC_WEB_URL", "https://nomai.travel/");
    expect(resolvePhotoUrl("/images/x.webp")).toBe(
      "https://nomai.travel/images/x.webp"
    );
  });

  it("passes absolute URLs through untouched (Owner Storage uploads)", () => {
    vi.stubEnv("PUBLIC_WEB_URL", "https://nomai.travel");
    const storage =
      "https://tspsaemylnzvdgwtjcrz.supabase.co/storage/v1/object/public/listing-photos/bus_1/lst_1/0-abc12345.jpg";
    expect(resolvePhotoUrl(storage)).toBe(storage);
    expect(resolvePhotoUrl("http://cdn.example.com/p.jpg")).toBe(
      "http://cdn.example.com/p.jpg"
    );
  });
});

describe("listing photo serialization", () => {
  it("emits absolute cover_photo and photos[].url on search and detail", () => {
    vi.stubEnv("PUBLIC_WEB_URL", "https://nomai.travel");
    const card = searchListings({ city: "Purmamarca" }).find(
      (c) => c.slug === "cabanas-siete-colores"
    );
    expect(card?.cover_photo).toBe(
      "https://nomai.travel/images/purmamarca-siete-colores.webp"
    );

    const detail = getListingBySlug("cabanas-siete-colores");
    expect(detail?.photos.length).toBe(3);
    expect(detail?.photos[0]).toMatchObject({
      url: "https://nomai.travel/images/purmamarca-siete-colores.webp",
      is_cover: true,
    });
    for (const p of detail?.photos ?? []) {
      expect(p.url).toMatch(/^https:\/\/nomai\.travel\/images\//);
    }
  });

  it("emits no cover_photo and an empty gallery for listings without curated photos", () => {
    const card = searchListings({ city: "Buenos Aires" }).find(
      (c) => c.slug === "habitacion-estandar-palermo-tower"
    );
    expect(card?.cover_photo).toBeUndefined();

    const detail = getListingBySlug("habitacion-estandar-palermo-tower");
    expect(detail?.photos).toEqual([]);
  });
});

describe("curated seed photos", () => {
  const imagesDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../web/public/images"
  );

  it("every seeded url points at a real file in apps/web/public/images", () => {
    expect(LISTING_PHOTOS.length).toBeGreaterThan(0);
    for (const p of LISTING_PHOTOS) {
      expect(p.url.startsWith("/images/")).toBe(true);
      expect(existsSync(resolve(imagesDir, p.url.slice("/images/".length)))).toBe(
        true
      );
    }
  });

  it("keeps id/position/is_cover semantics — one cover at position 0", () => {
    const byListing = new Map<string, typeof LISTING_PHOTOS>();
    for (const p of LISTING_PHOTOS) {
      byListing.set(p.listing_id, [...(byListing.get(p.listing_id) ?? []), p]);
    }
    for (const [listingId, photos] of byListing) {
      const sorted = [...photos].sort((a, b) => a.position - b.position);
      expect(sorted.map((p) => p.position)).toEqual(
        sorted.map((_, i) => i)
      );
      expect(sorted[0].is_cover).toBe(true);
      expect(sorted.filter((p) => p.is_cover).length).toBe(1);
      expect(sorted[0].id).toBe(`pho_${listingId}_1`);
      expect(photos.length).toBeLessThanOrEqual(3);
    }
  });
});
