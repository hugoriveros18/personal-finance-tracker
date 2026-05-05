import { Card, Stack, Title, type CardProps } from '@mantine/core';
import { ResponsiveContainer } from 'recharts';
import type { ReactElement, ReactNode } from 'react';

interface Props extends CardProps {
  title: string;
  subtitle?: string;
  height?: number;
  empty?: boolean;
  emptyText?: string;
  /** Optional control row rendered below the chart, outside the fixed-height area. */
  footer?: ReactNode;
  children: ReactElement | ReactNode;
}

export function ChartShell({
  title,
  subtitle,
  height = 260,
  empty,
  emptyText,
  footer,
  children,
  ...rest
}: Props) {
  return (
    <Card withBorder p="md" {...rest}>
      <Stack gap="xs">
        <div>
          <Title order={5}>{title}</Title>
          {subtitle && (
            <Title order={6} c="dimmed" fw={400}>
              {subtitle}
            </Title>
          )}
        </div>
        <div style={{ width: '100%', height }}>
          {empty ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--mantine-color-dimmed)',
                fontSize: 14,
              }}
            >
              {emptyText ?? 'Sin datos'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {children as ReactElement}
            </ResponsiveContainer>
          )}
        </div>
        {footer}
      </Stack>
    </Card>
  );
}
