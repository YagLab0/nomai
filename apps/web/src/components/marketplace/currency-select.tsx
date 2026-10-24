'use client';

import { ListBox, Select } from '@heroui/react';

import { FIAT_OPTIONS, type Fiat } from '@/lib/lodgings';

/** "Ver precios en": the Traveler's preferred currency; undefined = each Lodging's own. */
export function CurrencySelect({
  value,
  onChange,
  className = 'w-[160px]',
}: {
  value: Fiat | undefined;
  onChange: (fiat: Fiat | undefined) => void;
  className?: string;
}) {
  return (
    <Select
      aria-label="Ver precios en"
      variant="secondary"
      selectedKey={value ?? 'local'}
      onSelectionChange={(key) => onChange(key === 'local' ? undefined : (key as Fiat))}
      className={className}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="local" textValue="Moneda local">
            Moneda local
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {FIAT_OPTIONS.map((f) => (
            <ListBox.Item key={f.id} id={f.id} textValue={f.label}>
              {f.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
