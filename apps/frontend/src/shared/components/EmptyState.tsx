import { Center, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Center mih={160} p="md">
      <Stack align="center" gap="xs">
        <Text fw={600}>{title}</Text>
        {description && <Text size="sm" c="dimmed" ta="center">{description}</Text>}
        {action}
      </Stack>
    </Center>
  );
}
