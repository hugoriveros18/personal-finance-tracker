import { Text, type TextProps } from '@mantine/core';
import { formatCop } from '@/shared/lib/money';

interface Props extends TextProps {
  value: number | null | undefined;
  signed?: boolean;
  positive?: boolean;
  negative?: boolean;
}

export function MoneyDisplay({ value, signed, positive, negative, ...rest }: Props) {
  const formatted = formatCop(value);
  const display = signed && typeof value === 'number' && value > 0 ? `+${formatted}` : formatted;
  const color = positive ? 'teal.7' : negative ? 'red.7' : undefined;
  return (
    <Text {...rest} c={color}>
      {display}
    </Text>
  );
}
