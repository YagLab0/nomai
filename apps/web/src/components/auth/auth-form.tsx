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
  Separator,
  Spinner,
  TextField,
} from '@heroui/react';

import { VerificationLadder } from '@/components/auth/verification-ladder';

const COUNTRIES = [
  { code: 'AR', name: 'Argentina', dial: '+54' },
  { code: 'BR', name: 'Brasil', dial: '+55' },
  { code: 'CL', name: 'Chile', dial: '+56' },
  { code: 'UY', name: 'Uruguay', dial: '+598' },
  { code: 'PY', name: 'Paraguay', dial: '+595' },
  { code: 'BO', name: 'Bolivia', dial: '+591' },
] as const;

const RESEND_SECONDS = 30;
const FAKE_LATENCY_MS = 800;

type Busy = 'phone' | 'google' | 'email' | 'otp' | null;

const COPY = {
  signup: {
    title: 'Creá tu cuenta',
    lead: 'Con tu teléfono alcanza. Nomito se encarga del resto.',
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
} as const;

function formatClock(s: number) {
  return `0:${String(s).padStart(2, '0')}`;
}

export function AuthForm({ mode }: { mode: 'signup' | 'login' }) {
  const router = useRouter();
  const copy = COPY[mode];

  const [step, setStep] = useState<'method' | 'otp'>('method');
  const [country, setCountry] = useState<string>('AR');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  const dial = COUNTRIES.find((c) => c.code === country)?.dial ?? '+54';
  const digits = phone.replace(/\D/g, '');
  const phoneInvalid = digits.length < 8 || digits.length > 11;

  useEffect(() => {
    if (step !== 'otp' || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, seconds]);

  function simulate(kind: Exclude<Busy, null>, then?: () => void) {
    setBusy(kind);
    setTimeout(() => {
      if (then) {
        setBusy(null);
        then();
      } else {
        router.push('/app');
      }
    }, FAKE_LATENCY_MS);
  }

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (phoneInvalid || busy) return;
    simulate('phone', () => {
      setCode('');
      setSeconds(RESEND_SECONDS);
      setStep('otp');
    });
  }

  function verify(value: string) {
    if (busy || !/^\d{6}$/.test(value)) return;
    simulate('otp');
  }

  if (step === 'otp') {
    return (
      <div>
        <h1 className="font-brand text-3xl font-medium leading-tight text-ink">
          Revisá tu WhatsApp
        </h1>
        <p className="mt-2 text-ink-muted">
          Te mandamos un código de 6 dígitos al {dial} {digits}.
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
            value={code}
            onChange={setCode}
            onComplete={verify}
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
          {seconds > 0 ? (
            <span className="text-ink-muted">Reenviar código en {formatClock(seconds)}</span>
          ) : (
            <button
              type="button"
              className="font-medium text-terra-deep underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-terra"
              onClick={() => setSeconds(RESEND_SECONDS)}
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

        {mode === 'signup' && <VerificationLadder />}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-brand text-3xl font-medium leading-tight text-ink">{copy.title}</h1>
      <p className="mt-2 text-ink-muted">{copy.lead}</p>

      <form noValidate onSubmit={sendCode} className="mt-8 flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2" disabled={busy !== null}>
          <legend className="mb-1 text-sm font-medium text-ink">Tu teléfono</legend>
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
              isInvalid={touched && phoneInvalid}
              value={phone}
              onChange={(v) => setPhone(v.replace(/[^\d\s-]/g, ''))}
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

      <div className="my-6 flex items-center gap-3 text-sm text-ink-muted" role="separator" aria-label="o">
        <Separator className="flex-1" />
        o
        <Separator className="flex-1" />
      </div>

      <div className="flex flex-col gap-3">
        <Button
          variant="secondary"
          fullWidth
          size="lg"
          isPending={busy === 'google'}
          isDisabled={busy !== null && busy !== 'google'}
          onPress={() => simulate('google')}
        >
          {({ isPending }) => (
            <>
              {isPending && <Spinner color="current" size="sm" />}
              Continuar con Google
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          size="lg"
          isPending={busy === 'email'}
          isDisabled={busy !== null && busy !== 'email'}
          onPress={() => simulate('email')}
        >
          {({ isPending }) => (
            <>
              {isPending && <Spinner color="current" size="sm" />}
              Continuar con email
            </>
          )}
        </Button>
      </div>

      <p className="mt-6 text-sm text-ink-muted">
        {copy.swapText}{' '}
        <Link
          href={copy.swapHref}
          className="font-medium text-terra-deep underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-terra"
        >
          {copy.swapLink}
        </Link>
      </p>

      {mode === 'signup' && <VerificationLadder />}
    </div>
  );
}
