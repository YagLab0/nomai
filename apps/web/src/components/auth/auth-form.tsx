'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Button,
  FieldError,
  Input,
  InputOTP,
  Label,
  ListBox,
  REGEXP_ONLY_DIGITS,
  Select,
  Spinner,
  TextField,
} from '@heroui/react';

import { VerificationLadder } from '@/components/auth/verification-ladder';
import { ASK_PARAM } from '@/lib/nomito/ask';
import { createClient } from '@/lib/supabase/client';

const COUNTRIES = [
  { code: 'AR', name: 'Argentina', dial: '+54' },
  { code: 'BR', name: 'Brasil', dial: '+55' },
  { code: 'CL', name: 'Chile', dial: '+56' },
  { code: 'PE', name: 'Perú', dial: '+51' },
  { code: 'UY', name: 'Uruguay', dial: '+598' },
  { code: 'PY', name: 'Paraguay', dial: '+595' },
  { code: 'BO', name: 'Bolivia', dial: '+591' },
] as const;

const RESEND_SECONDS = 30;
const FAKE_LATENCY_MS = 800;

type Busy = 'phone' | 'otp' | 'auth' | null;

const COPY = {
  signup: {
    title: 'Creá tu cuenta',
    lead: 'Completá tus datos para empezar tu viaje con nomai.',
    swapText: '¿Ya tenés cuenta?',
    swapLink: 'Ingresá',
    swapHref: '/login',
  },
  login: {
    title: 'Ingresá a nomai',
    lead: 'Retomá el viaje donde lo dejaste.',
    swapText: '¿No tenés cuenta?',
    swapLink: 'Creala',
    swapHref: '/signup',
  },
  owner: {
    title: 'Verificá tu teléfono',
    lead: 'Te mandamos un código por WhatsApp para confirmar que sos vos.',
    swapText: '',
    swapLink: '',
    swapHref: '',
  },
} as const;

function formatClock(s: number) {
  return `0:${String(s).padStart(2, '0')}`;
}

/**
 * Supabase Auth for traveler login / signup; mock WhatsApp verification
 * for owner onboarding (/owners/join).
 */
export function AuthForm({ mode, onVerified }: { mode: keyof typeof COPY; onVerified?: () => void }) {
  const router = useRouter();
  const copy = COPY[mode];
  const Heading = mode === 'owner' ? 'h2' : 'h1';

  // Common URL params
  const [ask, setAsk] = useState<string | null>(null);
  const [nextDestination, setNextDestination] = useState<string>('/app');

  // Owner mock step
  const [step, setStep] = useState<'method' | 'otp'>('method');
  const [ownerCountry, setOwnerCountry] = useState<string>('AR');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerTouched, setOwnerTouched] = useState(false);
  const [ownerCode, setOwnerCode] = useState('');
  const [ownerSeconds, setOwnerSeconds] = useState(RESEND_SECONDS);

  // Real Auth state (login & signup)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<string>('AR');
  const [busy, setBusy] = useState<Busy>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    setAsk(searchParams.get(ASK_PARAM));

    const next = searchParams.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      setNextDestination(next);
    } else {
      const askVal = searchParams.get(ASK_PARAM);
      if (askVal) {
        setNextDestination(`/app?${ASK_PARAM}=${encodeURIComponent(askVal)}`);
      }
    }

    const err = searchParams.get('error');
    if (err === 'auth_callback_failed') {
      setErrorMsg('No se pudo verificar el enlace. Por favor, intentá ingresar nuevamente.');
    }
  }, []);

  // Countdown timer for owner OTP
  useEffect(() => {
    if (mode !== 'owner' || step !== 'otp' || ownerSeconds <= 0) return;
    const t = setTimeout(() => setOwnerSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [mode, step, ownerSeconds]);

  // ---------------------------------------------------------------------------
  // Owner mode handlers (mock phone + WhatsApp OTP)
  // ---------------------------------------------------------------------------
  const ownerDial = COUNTRIES.find((c) => c.code === ownerCountry)?.dial ?? '+54';
  const ownerDigits = ownerPhone.replace(/\D/g, '');
  const ownerPhoneInvalid = ownerDigits.length < 8 || ownerDigits.length > 11;

  function simulateOwner(kind: 'phone' | 'otp', then?: () => void) {
    setBusy(kind);
    setTimeout(() => {
      setBusy(null);
      if (then) {
        then();
      } else if (onVerified) {
        onVerified();
      }
    }, FAKE_LATENCY_MS);
  }

  function sendOwnerCode(e: React.FormEvent) {
    e.preventDefault();
    setOwnerTouched(true);
    if (ownerPhoneInvalid || busy) return;
    simulateOwner('phone', () => {
      setOwnerCode('');
      setOwnerSeconds(RESEND_SECONDS);
      setStep('otp');
    });
  }

  function verifyOwnerCode(value: string) {
    if (busy || !/^\d{6}$/.test(value)) return;
    simulateOwner('otp');
  }

  // ---------------------------------------------------------------------------
  // Real Traveler Auth handlers (Supabase Auth)
  // ---------------------------------------------------------------------------
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setBusy('auth');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message);
        setBusy(null);
        return;
      }

      if (data?.user?.id) {
        fetch('/api/wallet/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ traveler_id: data.user.id }),
        }).catch(() => null);
      }

      router.push(nextDestination);
      router.refresh();
    } catch {
      setErrorMsg('Ocurrió un error inesperado al intentar iniciar sesión.');
      setBusy(null);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy('auth');

    try {
      const supabase = createClient();
      const dial = COUNTRIES.find((c) => c.code === country)?.dial ?? '+54';
      const cleanPhone = phone.replace(/[^\d\s-]/g, '').trim();
      const fullPhone = cleanPhone ? `${dial} ${cleanPhone}` : undefined;
      const origin = window.location.origin;
      const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextDestination)}`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || undefined,
            name: fullName.trim() || undefined,
            phone: fullPhone,
            country_code: country,
          },
          emailRedirectTo,
        },
      });

      if (error) {
        setErrorMsg(error.message);
        setBusy(null);
        return;
      }

      if (data?.user?.id) {
        fetch('/api/wallet/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ traveler_id: data.user.id }),
        }).catch(() => null);
      }

      if (data?.session) {
        router.push(nextDestination);
        router.refresh();
      } else if (data?.user) {
        setSuccessMsg('¡Cuenta creada! Te enviamos un correo de confirmación. Por favor, revisá tu casilla.');
        setBusy(null);
      }
    } catch {
      setErrorMsg('Ocurrió un error inesperado al registrar la cuenta.');
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render: Owner phone verification flow
  // ---------------------------------------------------------------------------
  if (mode === 'owner') {
    if (step === 'otp') {
      return (
        <div>
          <Heading className="font-brand text-3xl font-medium leading-tight text-ink">
            Revisá tu WhatsApp
          </Heading>
          <p className="mt-2 text-ink-muted">
            Te mandamos un código de 6 dígitos al {ownerDial} {ownerDigits}.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Label id="otp-label">Código</Label>
            <InputOTP
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoFocus
              aria-labelledby="otp-label"
              isDisabled={busy === 'otp'}
              value={ownerCode}
              onChange={setOwnerCode}
              onComplete={verifyOwnerCode}
            >
              <InputOTP.Group>
                <InputOTP.Slot index={0} />
                <InputOTP.Slot index={1} />
                <InputOTP.Slot index={2} />
              </InputOTP.Group>
              <InputOTP.Separator />
              <InputOTP.Group>
                <InputOTP.Slot index={3} />
                <InputOTP.Slot index={4} />
                <InputOTP.Slot index={5} />
              </InputOTP.Group>
            </InputOTP>
            <p aria-live="polite" className="flex h-5 items-center gap-2 text-sm text-ink-muted">
              {busy === 'otp' && (
                <>
                  <Spinner size="sm" color="current" /> Verificando…
                </>
              )}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            {ownerSeconds > 0 ? (
              <span className="text-ink-muted">Reenviar código en {formatClock(ownerSeconds)}</span>
            ) : (
              <button
                type="button"
                className="font-medium text-terra-deep underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-terra"
                onClick={() => setOwnerSeconds(RESEND_SECONDS)}
              >
                Reenviar código
              </button>
            )}
            <button
              type="button"
              disabled={busy === 'otp'}
              className="font-medium text-terra-deep underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-terra disabled:opacity-50"
              onClick={() => setStep('method')}
            >
              Cambiar número
            </button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <Heading className="font-brand text-3xl font-medium leading-tight text-ink">{copy.title}</Heading>
        <p className="mt-2 text-ink-muted">{copy.lead}</p>

        <form noValidate onSubmit={sendOwnerCode} className="mt-8 flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2" disabled={busy !== null}>
            <legend className="mb-1 text-sm font-medium text-ink">Tu teléfono</legend>
            <div className="flex gap-2">
              <Select
                aria-label="País"
                className="w-40 shrink-0"
                value={ownerCountry}
                onChange={(key) => key && setOwnerCountry(String(key))}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {COUNTRIES.map((c) => (
                      <ListBox.Item key={c.code} id={c.code} textValue={`${c.code} ${c.dial}`}>
                        {c.code} {c.dial}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField
                aria-label="Número de teléfono"
                className="min-w-0 flex-1"
                isInvalid={ownerTouched && ownerPhoneInvalid}
                value={ownerPhone}
                onChange={(v) => setOwnerPhone(v.replace(/[^\d\s-]/g, ''))}
              >
                <Input fullWidth type="tel" inputMode="tel" autoComplete="tel-national" placeholder="387 555 1234" />
                <FieldError>Ingresá un número de 8 a 11 dígitos.</FieldError>
              </TextField>
            </div>
          </fieldset>

          <Button type="submit" fullWidth size="lg" isPending={busy === 'phone'} isDisabled={busy !== null && busy !== 'phone'}>
            {({ isPending }) => (
              <>
                {isPending && <Spinner color="current" size="sm" />}
                Recibir código por WhatsApp
              </>
            )}
          </Button>
        </form>
      </div>
    );
  }

  // Helper for swap href keeping query params
  const swapQuery = new URLSearchParams();
  if (nextDestination && nextDestination !== '/app') {
    swapQuery.set('next', nextDestination);
  }
  if (ask) {
    swapQuery.set(ASK_PARAM, ask);
  }
  const swapHref = swapQuery.toString() ? `${copy.swapHref}?${swapQuery.toString()}` : copy.swapHref;

  // ---------------------------------------------------------------------------
  // Render: Traveler Login & Signup
  // ---------------------------------------------------------------------------
  return (
    <div>
      <Heading className="font-brand text-3xl font-medium leading-tight text-ink">{copy.title}</Heading>
      <p className="mt-2 text-ink-muted">{copy.lead}</p>

      {ask && (
        <figure className="mt-6 rounded-[1.25rem] bg-terra-soft px-4 py-3">
          <figcaption className="text-xs font-medium text-terra-deep">Nomito ya tiene tu pedido</figcaption>
          <blockquote className="mt-1 text-[15px] text-ink">{ask}</blockquote>
        </figure>
      )}

      {errorMsg && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          {successMsg}
        </div>
      )}

      {mode === 'login' ? (
        <form noValidate onSubmit={handleLogin} className="mt-8 flex flex-col gap-4">
          <TextField isRequired value={email} onChange={setEmail}>
            <Label>Email</Label>
            <Input fullWidth type="email" autoComplete="email" placeholder="vos@ejemplo.com" />
          </TextField>

          <TextField isRequired value={password} onChange={setPassword}>
            <Label>Contraseña</Label>
            <Input fullWidth type="password" autoComplete="current-password" placeholder="••••••••" />
          </TextField>

          <Button
            type="submit"
            fullWidth
            size="lg"
            className="mt-2"
            isPending={busy === 'auth'}
            isDisabled={busy !== null}
          >
            {({ isPending }) => (
              <>
                {isPending && <Spinner color="current" size="sm" />}
                Ingresar
              </>
            )}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={handleSignup} className="mt-8 flex flex-col gap-4">
          <TextField value={fullName} onChange={setFullName}>
            <Label>Nombre completo</Label>
            <Input fullWidth type="text" autoComplete="name" placeholder="Tu nombre" />
          </TextField>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">Teléfono (opcional)</legend>
            <div className="flex gap-2">
              <Select
                aria-label="País"
                className="w-40 shrink-0"
                value={country}
                onChange={(key) => key && setCountry(String(key))}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {COUNTRIES.map((c) => (
                      <ListBox.Item key={c.code} id={c.code} textValue={`${c.code} ${c.dial}`}>
                        {c.code} {c.dial}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField
                aria-label="Número de teléfono"
                className="min-w-0 flex-1"
                value={phone}
                onChange={(v) => setPhone(v.replace(/[^\d\s-]/g, ''))}
              >
                <Input fullWidth type="tel" inputMode="tel" autoComplete="tel-national" placeholder="387 555 1234" />
              </TextField>
            </div>
          </fieldset>

          <TextField isRequired value={email} onChange={setEmail}>
            <Label>Email</Label>
            <Input fullWidth type="email" autoComplete="email" placeholder="vos@ejemplo.com" />
          </TextField>

          <TextField isRequired value={password} onChange={setPassword}>
            <Label>Contraseña</Label>
            <Input fullWidth type="password" autoComplete="new-password" placeholder="Al menos 6 caracteres" />
          </TextField>

          <Button
            type="submit"
            fullWidth
            size="lg"
            className="mt-2"
            isPending={busy === 'auth'}
            isDisabled={busy !== null}
          >
            {({ isPending }) => (
              <>
                {isPending && <Spinner color="current" size="sm" />}
                Crear cuenta
              </>
            )}
          </Button>
        </form>
      )}

      <p className="mt-6 text-sm text-ink-muted">
        {copy.swapText}{' '}
        <Link
          href={swapHref}
          className="font-medium text-terra-deep underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-terra"
        >
          {copy.swapLink}
        </Link>
      </p>

      {mode === 'signup' && <VerificationLadder />}
    </div>
  );
}
