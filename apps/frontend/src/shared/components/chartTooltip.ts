// Shared style for Recharts <Tooltip /> so the floating panel reads correctly
// in both light and dark themes (Recharts defaults to inline dark text which
// disappears against Mantine's dark background).

const contentStyle: React.CSSProperties = {
  background: 'var(--mantine-color-body)',
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: 8,
  color: 'var(--mantine-color-text)',
};

const itemStyle: React.CSSProperties = {
  color: 'var(--mantine-color-text)',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--mantine-color-text)',
  fontWeight: 600,
};

export const chartTooltipProps = {
  contentStyle,
  itemStyle,
  labelStyle,
} as const;
