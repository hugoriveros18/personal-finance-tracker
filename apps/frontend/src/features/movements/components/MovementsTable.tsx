import { getTableLabels } from '@/shared/lib/tableLabels';
import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Menu, Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconDots, IconEdit, IconEye, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { deleteMovement, listMovements, movementKeys } from '../api/movements';
import { useFormatters } from '@/shared/hooks/useFormatters';
import type { Movement, MovementFlow } from '@/shared/types/domain';
import { openMovementFormModal } from './MovementFormModal';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { getApiErrorMessage } from '@/shared/api/client';

const flowColors: Record<MovementFlow, string> = {
  INTER_AVAILABLE: 'yellow',
  INTRA_AVAILABLE_TO_SAVINGS: 'teal',
  INTRA_SAVINGS_TO_AVAILABLE: 'grape',
};

interface Props {
  /** Movements where the account is EITHER source or destination (OR). */
  filterAccountIds?: string[];
  /** Movements where the account is exclusively the source. */
  filterSourceAccountIds?: string[];
  /** Movements where the account is exclusively the destination. */
  filterDestinationAccountIds?: string[];
  filterMonth?: string;
  filterFlows?: MovementFlow[];
  filterAmountMin?: number;
  filterAmountMax?: number;
}

export function MovementsTable(props: Props) {
  const { t } = useTranslation();
  const f = useFormatters();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(() => {
    const p: Record<string, string | number | undefined> = { page, pageSize };
    if (props.filterMonth) p.month = props.filterMonth;
    if (props.filterAccountIds?.length) {
      p.accountIds = props.filterAccountIds.join(',');
    }
    if (props.filterSourceAccountIds?.length) {
      p.sourceAccountIds = props.filterSourceAccountIds.join(',');
    }
    if (props.filterDestinationAccountIds?.length) {
      p.destinationAccountIds = props.filterDestinationAccountIds.join(',');
    }
    if (props.filterFlows?.length) p.flows = props.filterFlows.join(',');
    if (props.filterAmountMin !== undefined) p.amountMin = props.filterAmountMin;
    if (props.filterAmountMax !== undefined) p.amountMax = props.filterAmountMax;
    return p;
  }, [page, pageSize, props]);

  const { data, isFetching } = useQuery({
    queryKey: movementKeys.list(params),
    queryFn: () => listMovements(params),
    placeholderData: (prev) => prev,
  });

  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const accountName = (id: string) => accountsQ.data?.find((a) => a.id === id)?.name ?? '—';

  const removeMut = useMutation({
    mutationFn: deleteMovement,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: movementKeys.all }),
        qc.invalidateQueries({ queryKey: accountKeys.all }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      notifications.show({ color: 'teal', message: t('common.deleted') });
    },
    onError: (err) => notifications.show({ color: 'red', message: getApiErrorMessage(err) }),
  });

  return (
    <DataTable<Movement>
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
          accessor: 'flow',
          title: t('common.type'),
          render: (r) => (
            <Badge variant="light" color={flowColors[r.flow]}>
              {t(`movements.flow.${r.flow}`)}
            </Badge>
          ),
        },
        {
          accessor: 'description',
          title: t('common.description'),
          render: (r) => <Text lineClamp={1}>{r.description}</Text>,
        },
        {
          accessor: 'sourceAccountId',
          title: t('movements.from'),
          render: (r) => accountName(r.sourceAccountId),
        },
        {
          accessor: 'destinationAccountId',
          title: t('movements.to'),
          render: (r) => accountName(r.destinationAccountId),
        },
        {
          accessor: 'amount',
          title: t('common.amount'),
          textAlign: 'right',
          width: 140,
          render: (r) => <Text fw={600}>{f.money(r.amount)}</Text>,
        },
        {
          accessor: 'actions',
          title: '',
          textAlign: 'right',
          width: 56,
          render: (r) => (
            <Menu width={150} withinPortal position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray">
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconEye size={14} />}
                  onClick={() => openMovementFormModal(t, r, 'view')}
                >
                  {t('common.view')}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconEdit size={14} />}
                  onClick={() => openMovementFormModal(t, r, 'edit')}
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
          ),
        },
      ]}
    />
  );
}
