import { NumberInput, type NumberInputProps } from '@mantine/core';
import { forwardRef } from 'react';

// `value` is integer CENTAVOS (1 COP = 100 centavos). The input field shows
// pesos with up to 2 decimals (es-CO: `,` decimal, `.` thousands).
export type MoneyInputProps = Omit<NumberInputProps, 'value' | 'onChange'> & {
  value?: number | null;
  onChange?: (value: number | null) => void;
};

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, ...rest },
  ref,
) {
  const displayValue = value === null || value === undefined ? '' : value / 100;
  return (
    <NumberInput
      ref={ref}
      value={displayValue}
      onChange={(v) => {
        if (v === '' || v === null || v === undefined) {
          onChange?.(null);
          return;
        }
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) {
          onChange?.(null);
          return;
        }
        onChange?.(Math.round(n * 100));
      }}
      prefix="$"
      thousandSeparator="."
      decimalSeparator=","
      decimalScale={2}
      fixedDecimalScale
      allowDecimal
      allowNegative={false}
      hideControls
      {...rest}
    />
  );
});
