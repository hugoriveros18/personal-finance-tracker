import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Group, Menu, Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconDots, IconEdit, IconEye, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { deleteMovement, listMovements, movementKeys } from '../api/movements';
import { useFormatters } from '@/shared/hooks/useFormatters';
import type { Movement, MovementFlujo } from '@/shared/types/domain';
import { openMovementFormModal } from './MovementFormModal';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { getApiErrorMessage } from '@/shared/api/client';

const flujoColors: Record<MovementFlujo, string> = {
  INTER_DISPONIBLE: 'yellow',
  INTRA_DISPONIBLE_TO_AHORRO: 'teal',
  INTRA_AHORRO_TO_DISPONIBLE: 'grape',
};

interface Props {
  /** Movements where the account is EITHER emisora or receptora (OR). */
  filterAccountIds?: string[];
  /** Movements where the account is exclusively the emisora. */
  filterEmisoraIds?: string[];
  /** Movements where the account is exclusively the receptora. */
  filterReceptoraIds?: string[];
  filterMonth?: string;
  filterFlujos?: MovementFlujo[];
  filterValorMin?: number;
  filterValorMax?: number;
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
    if (props.filterEmisoraIds?.length) {
      p.cuentaEmisoraIds = props.filterEmisoraIds.join(',');
    }
    if (props.filterReceptoraIds?.length) {
      p.cuentaReceptoraIds = props.filterReceptoraIds.join(',');
    }
    if (props.filterFlujos?.length) p.flujos = props.filterFlujos.join(',');
    if (props.filterValorMin !== undefined) p.valorMin = props.filterValorMin;
    if (props.filterValorMax !== undefined) p.valorMax = props.filterValorMax;
    return p;
  }, [page, pageSize, props]);

  const { data, isFetching } = useQuery({
    queryKey: movementKeys.list(params),
    queryFn: () => listMovements(params),
    placeholderData: (prev) => prev,
  });

  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const accountName = (id: string) => accountsQ.data?.find((a) => a.id === id)?.nombre ?? '—';

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
          accessor: 'flujo',
          title: t('common.type'),
          render: (r) => (
            <Badge variant="light" color={flujoColors[r.flujo]}>
              {t(`movements.flujo.${r.flujo}`)}
            </Badge>
          ),
        },
        {
          accessor: 'descripcion',
          title: t('common.description'),
          render: (r) => <Text lineClamp={1}>{r.descripcion}</Text>,
        },
        {
          accessor: 'cuentaEmisoraId',
          title: t('movements.from'),
          render: (r) => accountName(r.cuentaEmisoraId),
        },
        {
          accessor: 'cuentaReceptoraId',
          title: t('movements.to'),
          render: (r) => accountName(r.cuentaReceptoraId),
        },
        {
          accessor: 'valor',
          title: t('common.amount'),
          textAlign: 'right',
          width: 140,
          render: (r) => <Text fw={600}>{f.money(r.valor)}</Text>,
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
