import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Center mih="100vh">
      <Stack align="center">
        <Title order={1}>404</Title>
        <Text c="dimmed">{t('common.noData')}</Text>
        <Button component={Link} to="/app">
          {t('nav.dashboard')}
        </Button>
      </Stack>
    </Center>
  );
}
