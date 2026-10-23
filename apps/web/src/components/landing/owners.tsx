const POINTS = [
  {
    title: 'Cobrás al instante, en tu moneda',
    text: 'Sin esperar 30 o 60 días. La reserva se paga directo a tu cuenta.',
  },
  {
    title: 'Importamos tu perfil',
    text: 'Traemos tu alojamiento desde Booking o Airbnb; no cargás nada dos veces.',
  },
  {
    title: 'La reserva se confirma sola',
    text: 'A cualquier hora, el pago confirma la reserva. Vos solo recibís al viajero.',
  },
];

export function Owners() {
  return (
    <section id="duenos" className="scroll-mt-16 bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <p className="font-mono text-sm text-agua">para dueños de alojamientos</p>
          <h2 className="brand-display mt-3 text-5xl font-medium leading-[1.02] sm:text-6xl">Cero comisión. Siempre.</h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-paper/70">
            Los viajeros llegan con Nomito, pagan en su moneda y vos cobrás lo que pusiste de precio.
          </p>
          <a
            href="mailto:hola@nomai.app?subject=Quiero%20sumar%20mi%20alojamiento"
            className="mt-8 inline-flex h-12 items-center rounded-full bg-paper px-7 text-base font-medium text-ink transition-colors hover:bg-terra-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
          >
            Sumá tu alojamiento
          </a>
        </div>
        <ul className="flex flex-col divide-y divide-paper/15 border-y border-paper/15">
          {POINTS.map((p) => (
            <li key={p.title} className="py-6">
              <h3 className="font-brand text-2xl font-medium">{p.title}</h3>
              <p className="mt-2 text-paper/70">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
