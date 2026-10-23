import { Destinations } from '@/components/landing/destinations';
import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { NomitoDemo } from '@/components/landing/nomito-demo';
import { Owners } from '@/components/landing/owners';
import { Savings } from '@/components/landing/savings';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <NomitoDemo />
      <Destinations />
      <HowItWorks />
      <Savings />
      <Owners />
      <FinalCta />
    </>
  );
}
