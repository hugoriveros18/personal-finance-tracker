import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Group, Menu, Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconDots, IconEdit, IconTrash, IconEye } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  deleteTransaction,
  listTransactions,
  transactionKeys,
} from '../api/transactions';
import { useFormatters } from '@/shared/hooks/useFormatters';
import type { Transaction, TransactionTipo } from '@/shared/types/domain';
import { openTransactionFormModal } from './TransactionFormModal';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { categoryKeys, listCategories } from '@/features/categories/api/categories';
import { getApiErrorMessage } from '@/shared/api/client';

interface Props {
  filterAccountIds?: string[];
  filterMonth?: string;
  filterCategoryIds?: string[];
  filterTipos?: TransactionTipo[];
  filterValorMin?: number;
  filterValorMax?: number;
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
    if (props.filterTipos?.length) p.tipos = props.filterTipos.join(',');
    if (props.filterValorMin !== undefined) p.valorMin = props.filterValorMin;
    if (props.filterValorMax !== undefined) p.valorMax = props.filterValorMax;
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

  const accountName = (id: string) => accountsQ.data?.find((a) => a.id === id)?.nombre ?? '—';
  const categoryName = (id: string) => categoriesQ.data?.find((c) => c.id === id)?.nombre ?? '—';

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
          accessor: 'fecha',
          title: t('common.date'),
          render: (r) => f.date(r.fecha),
          width: 110,
        },
        {
          accessor: 'tipo',
          title: t('common.type'),
          render: (r) => (
            <Badge
              color={r.tipo === 'ingreso' ? 'teal' : r.tipo === 'egreso' ? 'orange' : 'red'}
              variant="light"
            >
              {t(`transactions.tipo${r.tipo.charAt(0).toUpperCase()}${r.tipo.slice(1)}`)}
            </Badge>
          ),
          width: 100,
        },
        {
          accessor: 'descripcion',
          title: t('common.description'),
          render: (r) => <Text lineClamp={1}>{r.descripcion}</Text>,
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
          accessor: 'valor',
          title: t('common.amount'),
          textAlign: 'right',
          width: 140,
          render: (r) => (
            <Text fw={600} c={r.tipo === 'ingreso' ? 'teal.7' : 'red.7'}>
              {r.tipo === 'ingreso' ? '+' : '-'}
              {f.money(r.valor)}
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
