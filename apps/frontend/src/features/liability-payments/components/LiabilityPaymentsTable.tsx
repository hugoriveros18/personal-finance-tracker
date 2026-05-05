import { useMemo, useState } from 'react';
import { ActionIcon, Group, Menu, Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  deleteLiabilityPayment,
  liabilityPaymentKeys,
  listLiabilityPayments,
} from '../api/liabilityPayments';
import { useFormatters } from '@/shared/hooks/useFormatters';
import type { LiabilityPayment } from '@/shared/types/domain';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { getApiErrorMessage } from '@/shared/api/client';

interface Props {
  filterAccountIds?: string[];
  filterMonth?: string;
}

export function LiabilityPaymentsTable(props: Props) {
  const { t } = useTranslation();
  const f = useFormatters();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(() => {
    const p: Record<string, string | number | undefined> = { page, pageSize };
    if (props.filterMonth) p.month = props.filterMonth;
    if (props.filterAccountIds?.length) p.accountIds = props.filterAccountIds.join(',');
    return p;
  }, [page, pageSize, props]);

  const { data, isFetching } = useQuery({
    queryKey: liabilityPaymentKeys.list(params),
    queryFn: () => listLiabilityPayments(params),
    placeholderData: (prev) => prev,
  });
  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const accountName = (id: string) => accountsQ.data?.find((a) => a.id === id)?.nombre ?? '—';

  const removeMut = useMutation({
    mutationFn: deleteLiabilityPayment,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: liabilityPaymentKeys.all }),
        qc.invalidateQueries({ queryKey: accountKeys.all }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      notifications.show({ color: 'teal', message: t('common.deleted') });
    },
    onError: (err) => notifications.show({ color: 'red', message: getApiErrorMessage(err) }),
  });

  return (
    <DataTable<LiabilityPayment>
      withTableBorder
      borderRadius="md"
      striped
      highlightOnHover
      minHeight={200}
      records={data?.items ?? []}
      fetching={isFetching}
      noRecordsText={t('common.noData')}
      totalRecords={data?.total ?? 0}
      recordsPerPage={pageSize}
      page={page}
      onPageChange={setPage}
      recordsPerPageOptions={[10, 25, 50, 100]}
      onRecordsPerPageChange={setPageSize}
      columns={[
        { accessor: 'fecha', title: t('common.date'), render: (r) => f.date(r.fecha), width: 110 },
        { accessor: 'descripcion', title: t('common.description') },
        {
          accessor: 'accountId',
          title: t('common.account'),
          render: (r) => accountName(r.accountId),
        },
        {
          accessor: 'valor',
          title: t('common.amount'),
          textAlign: 'right',
          width: 140,
          render: (r) => (
            <Text fw={600} c="orange.7">
              -{f.money(r.valor)}
            </Text>
          ),
        },
        {
          accessor: 'actions',
          title: '',
          textAlign: 'right',
          width: 56,
          render: (r) => (
            <Group justify="flex-end">
              <Menu width={150} withinPortal position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray">
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconTrash size={14} />}
                    color="red"
                    onClick={() =>
                      modals.openConfirmModal({
                        title: t('common.delete'),
                        children: <Text size="sm">{t('common.confirmDelete')}</Text>,
                        labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                        confirmProps: { color: 'red' },
                        onConfirm: () => removeMut.mutate(r.id),
                      })
                    }
                  >
                    {t('common.delete')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          ),
        },
      ]}
    />
  );
}
