/** Mock Traveler for the home panel. Replaced by the account API later. */

export interface LadderStep {
  title: string;
  status: 'done' | 'pending' | 'later';
}

export interface MockTraveler {
  name: string;
  initials: string;
  from: string;
  /** Drives how the Traveler funds the Agent wallet: 'ramp' vs 'qr'. */
  countryCode: string;
  currency: 'BRL';
  monedas: number;
  ladder: LadderStep[];
  /** What the next ladder step gives, shown on the monedas card. */
  nextStepCta: string;
  saldoBRL: number;
  nextBooking: {
    route: string;
    dates: string;
    lodging: string;
    town: string;
    status: 'Confirmada';
  };
  recentSearches: { id: string; title: string; date: string; monedas: number }[];
}

export const traveler: MockTraveler = {
  name: 'Lucas',
  initials: 'LU',
  from: 'Florianópolis',
  countryCode: 'BR',
  currency: 'BRL',
  monedas: 42,
  ladder: [
    { title: 'Teléfono', status: 'done' },
    { title: 'Primera carga de saldo', status: 'pending' },
    { title: 'Documento', status: 'later' },
  ],
  nextStepCta: 'Cargá saldo por primera vez y sumá 60 monedas',
  saldoBRL: 1920,
  nextBooking: {
    route: 'FLN → SLA',
    dates: '12 → 19 nov',
    lodging: 'Posada El Algarrobo',
    town: 'Salta',
    status: 'Confirmada',
  },
  recentSearches: [
    { id: 's1', title: 'Casa con pileta en Cafayate', date: '2 nov', monedas: 3 },
    { id: 's2', title: 'Hostel en Tilcara para 2', date: '29 oct', monedas: 3 },
    { id: 's3', title: 'Algo tranquilo en Purmamarca', date: '24 oct', monedas: 3 },
  ],
};
