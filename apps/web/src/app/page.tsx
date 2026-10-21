import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { ArrowRight, Check, X, Send } from "lucide-react";

const stats = [
  { value: "30%", label: "se pierde en impuestos y recargos cambiarios" },
  { value: "15–20%", label: "cobra una OTA de comisión al alojamiento" },
  { value: "60 días", label: "espera el dueño para cobrar una reserva" },
];

const currencies = ["wARS", "wBRL", "wCOP", "wMXN", "wPEN", "wCLP"];

const destinations = [
  { code: "FLN", name: "Florianópolis", country: "BR", price: "wBRL 240", status: "DIRECTO" },
  { code: "MDZ", name: "Mendoza", country: "AR", price: "wARS 38.000", status: "DIRECTO" },
  { code: "CUN", name: "Cancún", country: "MX", price: "wMXN 780", status: "DIRECTO" },
  { code: "CUZ", name: "Cusco", country: "PE", price: "wPEN 180", status: "DIRECTO" },
  { code: "BOG", name: "Bogotá", country: "CO", price: "wCOP 96.000", status: "DIRECTO" },
];

const steps = [
  {
    title: "Contale tu viaje",
    text: "Destino, fechas y presupuesto en tu moneda. Como hablarle a un amigo.",
  },
  {
    title: "El agente investiga y negocia",
    text: "Compara opciones, cierra precio y te trae una lista corta.",
  },
  {
    title: "Confirmás y paga",
    text: "Firma x402. Reserva liquidada en segundos, on-chain.",
  },
];

const travelerPoints = [
  "Pagás en wARS, wBRL o tu moneda local",
  "Sin tarjeta internacional ni dólar tarjeta",
  "Descuentos por pago local que hoy no podés usar",
  "Ahorro del 15% al 30% por viaje",
];

const ownerPoints = [
  "Cero comisión. Siempre.",
  "Cobro instantáneo en tu moneda, no a 60 días",
  "Un solo perfil — importamos tu listing de Booking o Airbnb",
  "Recepción 24/7: el pago confirma la reserva solo",
];

const comparison = [
  { label: "Comisión al alojamiento", today: "15–20%", nomai: "0%" },
  { label: "Liquidación del pago", today: "30–60 días", nomai: "Segundos" },
  {
    label: "Costo cambiario del viajero",
    today: "+7% a +30%",
    nomai: "0% — paga en su moneda",
  },
  {
    label: "Reserva de madrugada",
    today: "Se enfría hasta que alguien confirma",
    nomai: "Se confirma sola con el pago",
  },
];

const stack = [
  { name: "wFIAT", desc: "Stablecoins locales de Ripio", dot: "bg-gold" },
  { name: "x402", desc: "Pago programático por HTTP", dot: "bg-burn" },
  { name: "Celo", desc: "Gas < $0.001 por transacción", dot: "bg-terra" },
  { name: "ERC-8004", desc: "Identidad verificable del agente", dot: "bg-cocoa" },
];

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-mono text-muted-foreground shadow-sm">
      {children}
    </span>
  );
}

/* Mini-tile de embarque que flota alrededor del teléfono */
function BoardTile({
  code,
  price,
  className,
}: {
  code: string;
  price: string;
  className?: string;
}) {
  return (
    <div
      className={`hidden lg:block absolute rounded-xl border bg-card px-3.5 py-2.5 shadow-lg shadow-terra/10 text-left ${className}`}
    >
      <div className="font-mono text-[10px] text-muted-foreground tracking-widest">
        {code}
      </div>
      <div className="font-display text-sm font-semibold whitespace-nowrap">
        {price}
        <span className="font-mono text-[10px] font-normal text-muted-foreground">
          {" "}
          / noche
        </span>
      </div>
    </div>
  );
}

/* Teléfono con el chat del agente */
function PhoneMock() {
  return (
    <div className="relative mx-auto w-[280px] md:w-[310px]">
      {/* tiles flotantes alrededor */}
      <BoardTile code="FLN → BRASIL" price="wBRL 240" className="-left-44 top-20 -rotate-[8deg]" />
      <BoardTile code="MDZ → ARG" price="wARS 38.000" className="-right-40 top-10 rotate-[7deg]" />
      <BoardTile code="CUN → MEX" price="wMXN 780" className="-right-36 bottom-32 -rotate-[6deg]" />

      {/* chip testimonial estilo referencia */}
      <div className="hidden lg:flex absolute -left-48 bottom-40 rotate-[4deg] max-w-[190px] rounded-2xl border bg-terra-soft px-4 py-3 shadow-lg shadow-terra/10 items-start gap-2.5 text-left">
        <span className="mt-1 h-6 w-6 shrink-0 rounded-full bg-terra" />
        <p className="text-[11px] leading-snug text-foreground/80">
          El agente nos consiguió −12% pagando directo en Floripa.
        </p>
      </div>

      {/* teléfono */}
      <div className="relative rounded-[2.8rem] border-[10px] border-espresso bg-espresso shadow-2xl shadow-terra/25">
        <div className="rounded-[2.1rem] bg-bone overflow-hidden">
          {/* dynamic island */}
          <div className="relative pt-3">
            <div className="mx-auto h-6 w-24 rounded-full bg-espresso" />
          </div>

          {/* header del chat */}
          <div className="mt-3 flex items-center gap-2.5 border-b border-sand px-4 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-burn font-display text-xs font-bold text-white">
              n
            </span>
            <div className="flex-1">
              <div className="text-xs font-semibold leading-tight">tu agente</div>
              <div className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-burn" />
                en línea
              </div>
            </div>
            <span className="font-mono text-[9px] text-muted-foreground">9:41</span>
          </div>

          {/* mensajes */}
          <div className="space-y-3 px-3.5 py-4 text-[12.5px] leading-snug">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-burn px-3.5 py-2.5 text-white">
                Me voy 5 días a Floripa con mi pareja. Lo más económico con
                desayuno, cerca de la playa.
              </div>
            </div>
            <div className="flex">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-sand/70 px-3.5 py-2.5 text-foreground/80">
                Encontré 4 opciones. La mejor: Posada Marina, a 3 cuadras de la
                playa, con −12% por pago directo.
              </div>
            </div>

            {/* ticket stub de la reserva */}
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                <div>
                  <div className="text-xs font-semibold">Posada Marina</div>
                  <div className="font-mono text-[9px] text-muted-foreground tracking-wider">
                    FLN · BRASIL · 5 NOCHES
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold">R$ 1.240</div>
                  <div className="font-mono text-[9px] text-muted-foreground">
                    wBRL
                  </div>
                </div>
              </div>
              <div className="relative px-3.5">
                <div className="border-t-2 border-dashed border-border" />
                <div className="absolute -left-[21px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-bone" />
                <div className="absolute -right-[21px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-bone" />
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                  <Check className="h-3 w-3 text-burn" />
                  PAGADO · x402 · 1.2s
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/60">
                  0x8f3c…a91d
                </span>
              </div>
            </div>

            {/* escribiendo */}
            <div className="flex">
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-sand/70 px-3.5 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              </div>
            </div>
          </div>

          {/* input */}
          <div className="border-t border-sand px-3.5 py-3">
            <div className="flex items-center gap-2 rounded-full border bg-card px-3.5 py-2">
              <span className="flex-1 text-[11px] text-muted-foreground">
                Escribile a tu agente…
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-burn">
                <Send className="h-3 w-3 text-white" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero — texto + teléfono */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-40 right-0 h-96 w-[42rem] rounded-full bg-gold/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-terra/15 blur-3xl"
        />

        <div className="container relative px-4 mx-auto max-w-6xl py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 items-center gap-16 lg:gap-8">
          <div className="text-center lg:text-left">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-3 py-1 mb-7 text-xs font-mono rounded-full border bg-card text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-burn" />
                CELO × RIPIO · wFIAT + x402
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="text-5xl md:text-6xl xl:text-7xl font-bold tracking-tight mb-6">
                Reservá hospedaje
                <br />
                <span className="text-burn">como un local.</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="text-base md:text-lg text-muted-foreground mb-9 max-w-lg mx-auto lg:mx-0 leading-relaxed">
                Le hablás a tu agente, él busca y negocia por vos, y paga en tu
                moneda. Sin tarjeta internacional, con precios de local.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start items-center">
                <Button size="lg" className="px-8">
                  Hablar con el agente
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="px-8 bg-card">
                  Soy alojamiento
                </Button>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div className="mt-10 flex flex-wrap justify-center lg:justify-start gap-2">
                {currencies.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200} className="lg:justify-self-center">
            <PhoneMock />
          </Reveal>
        </div>
      </section>

      {/* Tablero de salidas — destinos */}
      <section id="destinos" className="bg-cocoa text-[#F0E6D2]">
        <div className="container px-4 mx-auto max-w-5xl py-20 md:py-24">
          <Reveal>
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="font-mono text-xs text-gold mb-3 tracking-widest">
                  SALIDAS · RESERVAS ABIERTAS
                </p>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  El agente consigue directo
                </h2>
              </div>
              <span className="hidden md:inline-flex items-center gap-2 font-mono text-xs text-[#F0E6D2]/50">
                <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                EN VIVO
              </span>
            </div>
          </Reveal>

          <div className="border-t border-[#F0E6D2]/15">
            {destinations.map((d, i) => (
              <Reveal key={d.code} delay={i * 100}>
                <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[3rem_1fr_1fr_auto_auto] items-center gap-4 md:gap-8 py-5 border-b border-[#F0E6D2]/15">
                  <span className="font-mono text-sm text-gold">{d.code}</span>
                  <span className="font-display text-lg md:text-xl font-semibold">
                    {d.name}
                    <span className="font-mono text-xs text-[#F0E6D2]/40 ml-2 hidden sm:inline">
                      {d.country}
                    </span>
                  </span>
                  <span className="hidden md:block font-mono text-sm text-[#F0E6D2]/60">
                    {d.price} <span className="text-[#F0E6D2]/40">/ noche</span>
                  </span>
                  <span className="hidden md:inline-flex font-mono text-[10px] tracking-widest text-cocoa bg-gold rounded px-2 py-0.5">
                    {d.status}
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#F0E6D2]/30 justify-self-end" />
                </div>
              </Reveal>
            ))}
          </div>
          <p className="font-mono text-xs text-[#F0E6D2]/40 mt-6">
            * precios por noche, pagados en la moneda del destino
          </p>
        </div>
      </section>

      {/* Stats — banda espresso */}
      <section className="bg-espresso text-[#F7F1E5]">
        <div className="container px-4 mx-auto max-w-5xl py-20 md:py-24">
          <p className="text-center font-mono text-xs text-[#F7F1E5]/40 mb-14 tracking-widest">
            VIAJAR POR LA REGIÓN ES FINANCIERAMENTE HOSTIL
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-6 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-display text-5xl md:text-6xl font-bold tracking-tight mb-3 text-gold">
                  {s.value}
                </div>
                <p className="text-sm text-[#F7F1E5]/60 max-w-[240px] mx-auto">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bento features */}
      <section className="border-t bg-card">
        <div className="container px-4 mx-auto max-w-5xl py-20 md:py-28">
          <Reveal>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Todo lo que una OTA no hace
            </h2>
            <p className="text-muted-foreground mb-14 max-w-lg">
              El agente trabaja para el viajero, cobra como un local y liquida
              al instante.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Reveal className="md:col-span-4">
              <div className="rounded-2xl border p-7 h-full bg-background">
                <div className="rounded-xl bg-muted p-4 space-y-3 mb-6 text-sm">
                  <div className="flex">
                    <div className="rounded-xl rounded-tl-sm bg-card border px-3.5 py-2 text-muted-foreground">
                      ¿Mejor precio por pago directo?
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="rounded-xl rounded-tr-sm bg-burn text-white px-3.5 py-2">
                      −12% confirmado. Queda en R$ 1.240 por 5 noches.
                    </div>
                  </div>
                </div>
                <h3 className="font-display font-semibold mb-1.5">
                  El agente negocia por vos
                </h3>
                <p className="text-sm text-muted-foreground">
                  Habla directo con el alojamiento y te asegura el descuento por
                  pago local que hoy no podés usar.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120} className="md:col-span-2">
              <div className="rounded-2xl border p-7 h-full bg-background">
                <div className="font-display text-4xl font-bold tracking-tight mb-6">
                  1.2<span className="text-burn">s</span>
                </div>
                <h3 className="font-display font-semibold mb-1.5">
                  Liquidación instantánea
                </h3>
                <p className="text-sm text-muted-foreground">
                  El pago x402 confirma la reserva solo. Sin comprobantes a las
                  3 AM.
                </p>
              </div>
            </Reveal>

            <Reveal className="md:col-span-2">
              <div className="rounded-2xl border p-7 h-full bg-background">
                <div className="font-display text-4xl font-bold tracking-tight text-burn mb-6">
                  0%
                </div>
                <h3 className="font-display font-semibold mb-1.5">
                  Comisión al alojamiento
                </h3>
                <p className="text-sm text-muted-foreground">
                  Lo que Booking se llevaba queda en el bolsillo del dueño.
                  Siempre.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120} className="md:col-span-2">
              <div className="rounded-2xl border p-7 h-full bg-background">
                <div className="flex flex-wrap gap-2 mb-6">
                  <Chip>wARS → wBRL</Chip>
                  <Chip>wCOP → wBRL</Chip>
                </div>
                <h3 className="font-display font-semibold mb-1.5">
                  Tu moneda, siempre
                </h3>
                <p className="text-sm text-muted-foreground">
                  El agente convierte solo y congela el cambio. Sin tarjeta, sin
                  dólar tarjeta.
                </p>
              </div>
            </Reveal>

            <Reveal delay={240} className="md:col-span-2">
              <div className="rounded-2xl border p-7 h-full bg-background">
                <div className="flex items-center gap-2 mb-6 font-mono text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-burn animate-pulse" />
                  03:14 · RESERVA CONFIRMADA
                </div>
                <h3 className="font-display font-semibold mb-1.5">
                  Recibo verificable
                </h3>
                <p className="text-sm text-muted-foreground">
                  Cada pago deja su hash on-chain. La reserva se prueba sola, en
                  Celoscan.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="border-t">
        <div className="container px-4 mx-auto max-w-5xl py-20 md:py-24">
          <Reveal>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-14">
              Cómo funciona
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 130}>
                <div className="border-t-2 border-foreground/15 pt-6">
                  <span className="font-mono text-xs text-burn mb-3 block">
                    0{i + 1}
                  </span>
                  <h3 className="font-display font-semibold mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Dos lados */}
      <section className="border-t bg-card">
        <div className="container px-4 mx-auto max-w-5xl py-20 md:py-28 grid grid-cols-1 md:grid-cols-2 gap-10">
          <Reveal>
            <div id="viajeros">
              <p className="font-mono text-xs text-burn mb-3 tracking-widest">
                PARA EL VIAJERO
              </p>
              <h3 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-8">
                Tu plata rinde
                <br />
                como en casa.
              </h3>
              <ul className="space-y-4">
                {travelerPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm">
                    <Check className="h-4 w-4 mt-0.5 text-burn shrink-0" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <div id="alojamientos">
              <p className="font-mono text-xs text-terra-deep mb-3 tracking-widest">
                PARA EL ALOJAMIENTO
              </p>
              <h3 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-8">
                Reservas pagas.
                <br />
                Sin comisión.
              </h3>
              <ul className="space-y-4">
                {ownerPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm">
                    <Check className="h-4 w-4 mt-0.5 text-terra-deep shrink-0" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Comparación */}
      <section className="border-t">
        <div className="container px-4 mx-auto max-w-3xl py-20 md:py-28">
          <Reveal>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-center mb-16">
              Hoy vs. con nomai
            </h2>
          </Reveal>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground border-b">
              <div className="px-5 py-3" />
              <div className="px-5 py-3 text-center">Hoy</div>
              <div className="px-5 py-3 text-center text-burn">nomai</div>
            </div>
            {comparison.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-3 border-b last:border-b-0"
              >
                <div className="px-5 py-4 text-sm font-medium">{row.label}</div>
                <div className="px-5 py-4 text-sm text-muted-foreground text-center flex items-center justify-center gap-1.5">
                  <X className="h-3.5 w-3.5 text-red-500/70 shrink-0 hidden sm:block" />
                  {row.today}
                </div>
                <div className="px-5 py-4 text-sm text-center flex items-center justify-center gap-1.5 font-medium">
                  <Check className="h-3.5 w-3.5 text-burn shrink-0 hidden sm:block" />
                  {row.nomai}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="border-t bg-card">
        <div className="container px-4 mx-auto max-w-5xl py-20 md:py-28">
          <p className="text-center font-mono text-xs text-muted-foreground mb-12 tracking-widest">
            SOLO ES POSIBLE CON ESTE STACK
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stack.map((tech) => (
              <div
                key={tech.name}
                className="rounded-2xl border bg-background p-6 text-center"
              >
                <div className={`h-2 w-2 rounded-full ${tech.dot} mx-auto mb-4`} />
                <div className="font-mono text-sm font-semibold mb-1.5">
                  {tech.name}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tech.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-burn to-terra-deep text-white">
        <div className="container px-4 mx-auto max-w-3xl py-24 md:py-32 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-6">
            ARS entra por una punta.
            <br />
            BRL cobra por la otra.
          </h2>
          <p className="text-lg text-white/75 mb-10">
            El viajero le habla a su agente. El dueño se despierta con reservas
            pagas.
          </p>
          <Button
            size="lg"
            className="px-8 bg-bone text-foreground hover:bg-bone/90"
          >
            Empezar ahora
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="bg-cocoa text-[#F0E6D2]">
        <div className="container px-4 mx-auto max-w-5xl py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-display font-bold tracking-tight">nomai</span>
          <p className="font-mono text-xs text-[#F0E6D2]/40">
            CELO × RIPIO · AGENTS ON OPEN RAILS
          </p>
        </div>
      </footer>
    </main>
  );
}
