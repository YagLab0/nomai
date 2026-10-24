import { Destinations } from '@/components/landing/destinations';
import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Owners } from '@/components/landing/owners';
import { Savings } from '@/components/landing/savings';
import { Ticker } from '@/components/landing/ticker';
import { fetchListings } from '@/lib/api';
import { apiCardToLodging } from '@/lib/api-mapping';

export default async function LandingPage() {
  // Live inventory for the destination tabs; when the API is unreachable the
  // section falls back to the static catalog instead of breaking the landing.
  const cards = await fetchListings().catch(() => null);
  const lodgings = cards?.map(apiCardToLodging);

  return (
    <>
      <Hero />
      <Destinations lodgings={lodgings} />
      <Ticker />
      <HowItWorks />
      <Savings />
      <Owners />
      <FinalCta />
    </>
  );
}
