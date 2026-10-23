import { HillArt } from '@/components/landing/hills';
import { formatARS } from '@/lib/format';
import { DESTINATIONS } from '@/lib/mock/destinations';

export function Destinations() {
  return (
    <section id="destinos" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-20 lg:py-28">
      <h2 className="brand-display max-w-2xl text-4xl font-medium leading-tight text-ink sm:text-5xl">
        Cinco pueblos, una quebrada
      </h2>
      <p className="mt-4 max-w-lg text-lg text-ink-muted">Precios de referencia por noche, directo con el dueño.</p>

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
        {DESTINATIONS.map((d, i) => (
          <li key={d.code} className={i < 3 ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-sand bg-white transition-shadow hover:shadow-[0_20px_40px_-24px_rgba(143,63,32,0.5)]">
              <HillArt
                palette={d.palette}
                seed={d.seed}
                stripes={d.stripes}
                className={`w-full ${i < 3 ? 'h-44' : 'h-52'} transition-transform duration-700 group-hover:scale-[1.03]`}
              />
              <div className="relative flex flex-1 items-end justify-between gap-4 border-t-2 border-dashed border-sand p-5">
                <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper" />
                <span aria-hidden="true" className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-paper" />
                <div>
                  <p className="font-mono text-xs tracking-widest text-ink-muted">{d.code}</p>
                  <h3 className="font-brand text-2xl font-medium text-ink">{d.name}</h3>
                  <p className="mt-1 max-w-[18rem] text-sm text-ink-muted">{d.tagline}</p>
                </div>
                <p className="shrink-0 text-right">
                  <span className="block text-xs text-ink-muted">desde</span>
                  <span className="font-mono text-sm font-semibold text-ink">{formatARS(d.fromARS)}</span>
                  <span className="block text-xs text-ink-muted">por noche</span>
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
