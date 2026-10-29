import { useEffect, useState } from 'react';
import { Group, Loader, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function WaitingMessage() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 75_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Stack gap="xs" role="status">
      <Group>
        <Loader size="sm" />
        <Text size="sm">{t('ai.loading')}</Text>
      </Group>
      <Text size="sm" c="dimmed">
        {t('ai.processingHint')}
      </Text>
      {slow && (
        <Text size="sm" c="dimmed">
          {t('ai.slow')}
        </Text>
      )}
    </Stack>
  );
}
