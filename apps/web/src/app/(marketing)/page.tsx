import { Destinations } from '@/components/landing/destinations';
import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Owners } from '@/components/landing/owners';
import { Savings } from '@/components/landing/savings';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Destinations />
      <Savings />
      <Owners />
      <FinalCta />
    </>
  );
}
