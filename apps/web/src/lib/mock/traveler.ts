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
  ladder: LadderStep[];
  saldoBRL: number;
  nextBooking: {
    route: string;
    dates: string;
    lodging: string;
    town: string;
    status: 'Confirmada';
  };
  recentSearches: { id: string; title: string; date: string }[];
}

export const traveler: MockTraveler = {
  name: 'Lucas',
  initials: 'LU',
  from: 'Florianópolis',
  countryCode: 'BR',
  currency: 'BRL',
  ladder: [
    { title: 'Teléfono', status: 'done' },
    { title: 'Primera carga de saldo', status: 'pending' },
    { title: 'Documento', status: 'later' },
  ],
  saldoBRL: 1920,
  nextBooking: {
    route: 'FLN → SLA',
    dates: '12 → 19 nov',
    lodging: 'Posada El Algarrobo',
    town: 'Salta',
    status: 'Confirmada',
  },
  recentSearches: [
    { id: 's1', title: 'Casa con pileta en Cafayate', date: '2 nov' },
    { id: 's2', title: 'Hostel en Tilcara para 2', date: '29 oct' },
    { id: 's3', title: 'Algo tranquilo en Purmamarca', date: '24 oct' },
  ],
};
