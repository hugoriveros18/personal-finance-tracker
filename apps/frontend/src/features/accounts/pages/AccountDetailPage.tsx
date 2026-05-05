import { useParams, useNavigate } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconCreditCardPay } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page } from '@/shared/components/Page';
import { MoneyDisplay } from '@/shared/components/MoneyDisplay';
import { accountKeys, getAccount } from '../api/accounts';
import { openLiabilityPaymentModal } from '@/features/liability-payments/components/LiabilityPaymentModal';
import { TransactionsTable } from '@/features/transactions/components/TransactionsTable';
import { MovementsTable } from '@/features/movements/components/MovementsTable';
import { LiabilityPaymentsTable } from '@/features/liability-payments/components/LiabilityPaymentsTable';

export default function AccountDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: account, isLoading } = useQuery({
    queryKey: accountKeys.one(id!),
    queryFn: () => getAccount(id!),
    enabled: !!id,
  });

  if (isLoading || !account) return null;

  return (
    <Page
      title={account.nombre}
      description={t('accounts.subtitle')}
      actions={
        <Group>
          <Button
            variant="default"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate('/app/accounts')}
          >
            {t('nav.accounts')}
          </Button>
          {account.pasivos > 0 && (
            <Button
              color="orange"
              leftSection={<IconCreditCardPay size={16} />}
              onClick={() => openLiabilityPaymentModal(account, t)}
            >
              {t('accounts.payLiability')}
            </Button>
          )}
        </Group>
      }
    >
      <Card withBorder p="lg">
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">{t('dashboard.disponible')}</Text>
            <MoneyDisplay value={account.disponible} fw={700} fz="xl" />
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">{t('dashboard.ahorro')}</Text>
            <MoneyDisplay value={account.ahorro} fw={700} fz="xl" />
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">{t('dashboard.pasivos')}</Text>
            <MoneyDisplay value={account.pasivos} fw={700} fz="xl" c="red.7" />
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">Total</Text>
            <MoneyDisplay value={account.total} fw={700} fz="xl" c="teal.7" />
          </Stack>
        </SimpleGrid>
      </Card>

      <Tabs defaultValue="transactions">
        <Tabs.List>
          <Tabs.Tab value="transactions">{t('accounts.tabs.transactions')}</Tabs.Tab>
          <Tabs.Tab value="movements">{t('accounts.tabs.movements')}</Tabs.Tab>
          <Tabs.Tab value="liabilityPayments">{t('accounts.tabs.liabilityPayments')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="transactions" pt="md">
          <TransactionsTable filterAccountIds={[account.id]} />
        </Tabs.Panel>
        <Tabs.Panel value="movements" pt="md">
          <MovementsTable filterAccountIds={[account.id]} />
        </Tabs.Panel>
        <Tabs.Panel value="liabilityPayments" pt="md">
          <LiabilityPaymentsTable filterAccountIds={[account.id]} />
        </Tabs.Panel>
      </Tabs>
    </Page>
  );
}
