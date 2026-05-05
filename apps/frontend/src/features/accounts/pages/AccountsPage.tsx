import { Button, Card, Group, SimpleGrid, Stack, Text, Title, Menu, ActionIcon } from '@mantine/core';
import {
  IconDots,
  IconEdit,
  IconPlus,
  IconCreditCardPay,
  IconTrash,
  IconArrowRight,
} from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Page } from '@/shared/components/Page';
import { MoneyDisplay } from '@/shared/components/MoneyDisplay';
import { EmptyState } from '@/shared/components/EmptyState';
import { accountKeys, deleteAccount, listAccounts } from '../api/accounts';
import { openAccountFormModal } from '../components/AccountFormModal';
import { openLiabilityPaymentModal } from '@/features/liability-payments/components/LiabilityPaymentModal';
import { notifications } from '@mantine/notifications';
import { getApiErrorMessage } from '@/shared/api/client';

export default function AccountsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: accountKeys.all,
    queryFn: listAccounts,
  });

  const removeMut = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountKeys.all });
      notifications.show({ color: 'teal', message: t('common.deleted') });
    },
    onError: (err) => notifications.show({ color: 'red', message: getApiErrorMessage(err) }),
  });

  const totals = accounts.reduce(
    (acc, a) => {
      acc.disponible += a.disponible;
      acc.ahorro += a.ahorro;
      acc.pasivos += a.pasivos;
      return acc;
    },
    { disponible: 0, ahorro: 0, pasivos: 0 },
  );
  const patrimonio = totals.disponible + totals.ahorro - totals.pasivos;

  return (
    <Page
      title={t('accounts.title')}
      description={t('accounts.subtitle')}
      actions={
        <Button leftSection={<IconPlus size={16} />} onClick={() => openAccountFormModal(undefined, t)}>
          {t('accounts.newAccount')}
        </Button>
      }
    >
      <Card withBorder p="lg">
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('accounts.totalsBar.disponible')}
            </Text>
            <MoneyDisplay value={totals.disponible} fw={700} fz="xl" />
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('accounts.totalsBar.ahorro')}
            </Text>
            <MoneyDisplay value={totals.ahorro} fw={700} fz="xl" />
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('accounts.totalsBar.pasivos')}
            </Text>
            <MoneyDisplay value={totals.pasivos} fw={700} fz="xl" c="red.7" />
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('accounts.totalsBar.patrimonio')}
            </Text>
            <MoneyDisplay value={patrimonio} fw={700} fz="xl" c="teal.7" />
          </Stack>
        </SimpleGrid>
      </Card>

      {!isLoading && accounts.length === 0 ? (
        <EmptyState
          title={t('common.noData')}
          action={
            <Button leftSection={<IconPlus size={16} />} onClick={() => openAccountFormModal(undefined, t)}>
              {t('accounts.newAccount')}
            </Button>
          }
        />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {accounts.map((a) => (
            <Card withBorder key={a.id} p="lg">
              <Stack>
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Title order={4}>{a.nombre}</Title>
                    <Text size="xs" c="dimmed">
                      {t('common.amount')}
                    </Text>
                  </Stack>
                  <Menu width={180} withinPortal position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label="actions">
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconEdit size={14} />}
                        onClick={() => openAccountFormModal(a, t)}
                      >
                        {t('common.edit')}
                      </Menu.Item>
                      {a.pasivos > 0 && (
                        <Menu.Item
                          leftSection={<IconCreditCardPay size={14} />}
                          onClick={() => openLiabilityPaymentModal(a, t)}
                        >
                          {t('accounts.payLiability')}
                        </Menu.Item>
                      )}
                      <Menu.Divider />
                      <Menu.Item
                        leftSection={<IconTrash size={14} />}
                        color="red"
                        onClick={() =>
                          modals.openConfirmModal({
                            title: t('common.delete'),
                            children: <Text size="sm">{t('accounts.deleteHint')}</Text>,
                            labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                            confirmProps: { color: 'red' },
                            onConfirm: () => removeMut.mutate(a.id),
                          })
                        }
                      >
                        {t('common.delete')}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
                <SimpleGrid cols={2} spacing={4}>
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed">
                      {t('dashboard.disponible')}
                    </Text>
                    <MoneyDisplay value={a.disponible} fw={600} />
                  </Stack>
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed">
                      {t('dashboard.ahorro')}
                    </Text>
                    <MoneyDisplay value={a.ahorro} fw={600} />
                  </Stack>
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed">
                      {t('dashboard.pasivos')}
                    </Text>
                    <MoneyDisplay value={a.pasivos} fw={600} c={a.pasivos ? 'red.7' : undefined} />
                  </Stack>
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed">
                      Total
                    </Text>
                    <MoneyDisplay value={a.total} fw={600} />
                  </Stack>
                </SimpleGrid>
                <Group justify="space-between">
                  {a.pasivos > 0 && (
                    <Button
                      variant="light"
                      color="orange"
                      size="xs"
                      leftSection={<IconCreditCardPay size={14} />}
                      onClick={() => openLiabilityPaymentModal(a, t)}
                    >
                      {t('accounts.payLiability')}
                    </Button>
                  )}
                  <Button
                    component={Link}
                    to={`/app/accounts/${a.id}`}
                    variant="subtle"
                    size="xs"
                    rightSection={<IconArrowRight size={14} />}
                    ml="auto"
                  >
                    {t('common.view')}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Page>
  );
}
