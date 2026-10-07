import { getTableLabels } from '@/shared/lib/tableLabels';
import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Group, Menu, Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconDots, IconEdit, IconTrash, IconEye } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { deleteTransaction, listTransactions, transactionKeys } from '../api/transactions';
import { useFormatters } from '@/shared/hooks/useFormatters';
import type { Transaction, TransactionType } from '@/shared/types/domain';
import { openTransactionFormModal } from './TransactionFormModal';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { categoryKeys, listCategories } from '@/features/categories/api/categories';
import { getApiErrorMessage } from '@/shared/api/client';

interface Props {
  filterAccountIds?: string[];
  filterMonth?: string;
  filterCategoryIds?: string[];
  filterTypes?: TransactionType[];
  filterAmountMin?: number;
  filterAmountMax?: number;
  search?: string;
}

export function TransactionsTable(props: Props) {
  const { t } = useTranslation();
  const f = useFormatters();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(() => {
    const p: Record<string, string | number | undefined> = { page, pageSize };
    if (props.filterMonth) p.month = props.filterMonth;
    if (props.filterAccountIds?.length) p.accountIds = props.filterAccountIds.join(',');
    if (props.filterCategoryIds?.length) p.categoryIds = props.filterCategoryIds.join(',');
    if (props.filterTypes?.length) p.types = props.filterTypes.join(',');
    if (props.filterAmountMin !== undefined) p.amountMin = props.filterAmountMin;
    if (props.filterAmountMax !== undefined) p.amountMax = props.filterAmountMax;
    if (props.search) p.q = props.search;
    return p;
  }, [page, pageSize, props]);

  const { data, isFetching } = useQuery({
    queryKey: transactionKeys.list(params),
    queryFn: () => listTransactions(params),
    placeholderData: (prev) => prev,
  });
  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const categoriesQ = useQuery({ queryKey: categoryKeys.all, queryFn: () => listCategories() });

  const accountName = (id: string) => accountsQ.data?.find((a) => a.id === id)?.name ?? '—';
  const categoryName = (id: string) => categoriesQ.data?.find((c) => c.id === id)?.name ?? '—';

  const removeMut = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: transactionKeys.all }),
        qc.invalidateQueries({ queryKey: accountKeys.all }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      notifications.show({ color: 'teal', message: t('common.deleted') });
    },
    onError: (err) => notifications.show({ color: 'red', message: getApiErrorMessage(err) }),
  });

  return (
    <DataTable<Transaction>
      {...getTableLabels(t)}
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
        {
          accessor: 'date',
          title: t('common.date'),
          render: (r) => f.date(r.date),
          width: 110,
        },
        {
          accessor: 'type',
          title: t('common.type'),
          render: (r) => (
            <Badge
              color={r.type === 'income' ? 'teal' : r.type === 'expense' ? 'orange' : 'red'}
              variant="light"
            >
              {t(`transactions.${r.type}`)}
            </Badge>
          ),
          width: 100,
        },
        {
          accessor: 'description',
          title: t('common.description'),
          render: (r) => <Text lineClamp={1}>{r.description}</Text>,
        },
        {
          accessor: 'categoryId',
          title: t('common.category'),
          render: (r) => categoryName(r.categoryId),
        },
        {
          accessor: 'accountId',
          title: t('common.account'),
          render: (r) => accountName(r.accountId),
        },
        {
          accessor: 'amount',
          title: t('common.amount'),
          textAlign: 'right',
          width: 140,
          render: (r) => (
            <Text fw={600} c={r.type === 'income' ? 'teal.7' : 'red.7'}>
              {r.type === 'income' ? '+' : '-'}
              {f.money(r.amount)}
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
                    leftSection={<IconEye size={14} />}
                    onClick={() => openTransactionFormModal(t, r, 'view')}
                  >
                    {t('common.view')}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconEdit size={14} />}
                    onClick={() => openTransactionFormModal(t, r, 'edit')}
                  >
                    {t('common.edit')}
                  </Menu.Item>
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
