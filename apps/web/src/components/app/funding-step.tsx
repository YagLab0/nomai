'use client';

import { useState, type FormEvent } from 'react';
import {
  Button,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
} from '@heroui/react';

import { FUNDING_FIATS, defaultFundingFiat, parseFundingAmount } from '@/lib/funding';
import { formatFiat } from '@/lib/format';
import { FIAT_META, RIPIO_COUNTRIES, type Fiat } from '@/lib/lodgings';

const RETRY_MESSAGE = 'No pudimos preparar tu cuenta, probá de nuevo';
const UNAVAILABLE_MESSAGE = 'La carga todavía no está disponible';
const GENERIC_MESSAGE = 'No pudimos generar el link, probá de nuevo';

/**
 * The "Cargar" Funding step inside the saldo card (issue #40): asks the payer
 * country the first time only (the API persists it, it is never re-asked),
 * the amount — validated here, in the Traveler's own writing ("95.000" is
 * ninety-five thousand) — and the wFIAT to load (their country's by default,
 * all six selectable). A valid submit asks the API for the Ripio ramp deep
 * link and opens it in a NEW TAB; the Agent wallet address rides inside that
 * URL and never appears in nomai's DOM.
 */
export function FundingStep({
  countryCode,
  onOpened,
  onCancel,
}: {
  /** The Traveler's stored payer country — null asks it this once. */
  countryCode: string | null;
  /** The ramp link was generated and opened in a new tab. */
  onOpened: () => void;
  onCancel: () => void;
}) {
  const needsCountry = countryCode === null;
  const [country, setCountry] = useState<string | null>(null);
  const [countryInvalid, setCountryInvalid] = useState(false);
  const [currency, setCurrency] = useState<Fiat>(defaultFundingFiat(countryCode));
  const [amountRaw, setAmountRaw] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFundingAmount(amountRaw);
    if (amount === null) {
      setAmountError('Ingresá un monto válido.');
      return;
    }
    if (needsCountry && !country) {
      setCountryInvalid(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/wallet/funding-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          ...(needsCountry && country ? { country } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
        min?: number;
      } | null;

      if (res.ok && data?.url) {
        // `noopener` in the features list makes window.open return null even
        // on success — open the tab, then sever opener ourselves.
        const tab = window.open(data.url, '_blank');
        if (!tab) {
          setError('El navegador bloqueó la pestaña de Ripio — permitila y probá de nuevo.');
          return;
        }
        tab.opener = null;
        onOpened();
        return;
      }

      setError(
        data?.error === 'wallet_unavailable'
          ? RETRY_MESSAGE
          : data?.error === 'currency_unavailable'
            ? UNAVAILABLE_MESSAGE
            : data?.error === 'invalid_amount'
              ? typeof data?.min === 'number'
                ? `El mínimo para cargar es ${formatFiat(data.min, currency)}.`
                : 'Ingresá un monto válido.'
              : data?.error === 'country_required' || data?.error === 'invalid_country'
                ? 'Elegí el país desde el que pagás.'
                : GENERIC_MESSAGE,
      );
    } catch {
      setError(GENERIC_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3" data-testid="funding-step">
      {needsCountry && (
        <Select
          isRequired
          placeholder="Elegí tu país"
          selectedKey={country}
          onSelectionChange={(k) => {
            setCountry(k ? String(k) : null);
            setCountryInvalid(false);
          }}
          isInvalid={countryInvalid}
        >
          <Label>¿Desde qué país pagás?</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {RIPIO_COUNTRIES.map((c) => (
                <ListBox.Item key={c.code} id={c.code} textValue={c.name}>
                  {c.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
          <FieldError>Elegí el país desde el que pagás.</FieldError>
        </Select>
      )}

      <TextField
        isRequired
        value={amountRaw}
        onChange={(v) => {
          setAmountRaw(v);
          setAmountError(null);
        }}
        isInvalid={amountError !== null}
      >
        <Label>Monto</Label>
        <Input fullWidth inputMode="decimal" placeholder="95.000" />
        <FieldError>{amountError}</FieldError>
      </TextField>

      <Select selectedKey={currency} onSelectionChange={(k) => k && setCurrency(k as Fiat)}>
        <Label>Moneda</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {FUNDING_FIATS.map((f) => (
              <ListBox.Item key={f} id={f} textValue={`${FIAT_META[f].name} (${f})`}>
                {FIAT_META[f].name} ({f})<ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {error && (
        <p role="alert" className="text-sm text-terra-deep">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" fullWidth isPending={busy}>
          {({ isPending }) => (
            <>
              {isPending && <Spinner color="current" size="sm" />}
              Continuar a Ripio
            </>
          )}
        </Button>
        <Button variant="tertiary" onPress={onCancel}>
          Volver
        </Button>
      </div>
    </form>
  );
}
