import { Group, Stack, Title, type TitleProps } from '@mantine/core';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  titleProps?: TitleProps;
}

export function Page({ title, description, actions, children }: Props) {
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={2}>
          <Title order={2}>{title}</Title>
          {description && (
            <Title order={6} c="dimmed" fw={400}>
              {description}
            </Title>
          )}
        </Stack>
        {actions}
      </Group>
      {children}
    </Stack>
  );
}
